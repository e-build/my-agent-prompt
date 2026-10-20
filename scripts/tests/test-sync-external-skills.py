#!/usr/bin/env python3
"""Offline integration tests; never touch the user's skill directories."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'sync-external-skills'


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.upstream = self.root / 'upstream'
        self.upstream.mkdir()
        self.git(self.upstream, 'init', '-b', 'main')
        self.git(self.upstream, 'config', 'user.email', 'test@example.com')
        self.git(self.upstream, 'config', 'user.name', 'Test')
        skill = self.upstream / 'skills/demo'
        skill.mkdir(parents=True)
        (skill / 'SKILL.md').write_text('---\nname: demo\ndescription: Test\n---\nv1\n')
        (self.upstream / 'helper.py').write_text('# dependency outside skill directory\n')
        self.git(self.upstream, 'add', '.')
        self.git(self.upstream, 'commit', '-m', 'initial')
        self.manifest = self.root / 'manifest.json'
        self.manifest.write_text(json.dumps({'sources': [{
            'id': 'demo-source', 'url': str(self.upstream), 'branch': 'main',
            'category': 'writing', 'skills': [{'name': 'demo', 'path': 'skills/demo'}]
        }]}))
        self.sources = self.root / 'sources'
        self.skills = self.root / 'skills'
        self.bridge = self.root / 'claude'
        self.env = dict(os.environ, EXTERNAL_SKILLS_MANIFEST=str(self.manifest),
                        EXTERNAL_SKILLS_SOURCES_DIR=str(self.sources),
                        AGENTS_SKILLS_DIR=str(self.skills), CLAUDE_SKILLS_DIR=str(self.bridge),
                        HOME=str(self.root / 'home'))
        (self.root / 'home/.claude').mkdir(parents=True)

    def git(self, path, *args):
        return subprocess.run(['git', '-C', str(path), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    def run_sync(self, *args, success=True):
        result = subprocess.run(['python3', str(SCRIPT), *args], env=self.env,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result

    def advance(self):
        (self.upstream / 'skills/demo/SKILL.md').write_text('---\nname: demo\ndescription: Test\n---\nv2\n')
        self.git(self.upstream, 'add', '.')
        self.git(self.upstream, 'commit', '-m', 'update')

    def test_install_preserves_full_repo_and_bridges(self):
        self.run_sync()
        target = (self.sources / 'demo-source/skills/demo').resolve()
        self.assertEqual((self.skills / 'demo').resolve(), target)
        self.assertEqual((self.bridge / 'demo').resolve(), target)
        self.assertTrue((self.sources / 'demo-source/helper.py').exists())
        self.run_sync()  # idempotent

    def test_update_is_explicit(self):
        self.run_sync()
        self.advance()
        self.run_sync()
        self.assertIn('v1', (self.skills / 'demo/SKILL.md').read_text())
        self.run_sync('--update', 'demo-source')
        self.assertIn('v2', (self.skills / 'demo/SKILL.md').read_text())

    def test_dirty_clone_refuses_update(self):
        self.run_sync()
        local = self.sources / 'demo-source/local.txt'
        local.write_text('keep me')
        self.advance()
        result = self.run_sync('--update', success=False)
        self.assertIn('local changes', result.stderr)
        self.assertEqual(local.read_text(), 'keep me')

    def test_user_directory_is_not_replaced(self):
        (self.skills / 'demo').mkdir(parents=True)
        self.run_sync(success=False)
        self.assertFalse((self.skills / 'demo').is_symlink())

    def test_foreign_link_is_not_replaced(self):
        self.skills.mkdir()
        (self.skills / 'demo').symlink_to(self.root / 'foreign')
        self.run_sync(success=False)
        self.assertEqual(os.readlink(self.skills / 'demo'), str(self.root / 'foreign'))

    def test_bridge_collision_prevents_skill_link(self):
        (self.bridge / 'demo').mkdir(parents=True)
        self.run_sync(success=False)
        self.assertFalse((self.skills / 'demo').exists())

    def test_no_bridge_flag(self):
        self.run_sync('--no-bridge')
        self.assertFalse(self.bridge.exists())

    def test_invalid_path_is_rejected_before_clone(self):
        data = json.loads(self.manifest.read_text())
        data['sources'][0]['skills'][0]['path'] = '../outside'
        self.manifest.write_text(json.dumps(data))
        self.run_sync(success=False)
        self.assertFalse(self.sources.exists())

    def test_missing_skill_does_not_install_links(self):
        data = json.loads(self.manifest.read_text())
        data['sources'][0]['skills'][0]['path'] = 'skills/missing'
        self.manifest.write_text(json.dumps(data))
        self.run_sync(success=False)
        self.assertFalse(self.skills.exists())

    def test_unknown_source_is_rejected(self):
        self.run_sync('unknown', success=False)
        self.assertFalse(self.sources.exists())

    def test_wrong_origin_is_rejected(self):
        self.run_sync()
        self.git(self.sources / 'demo-source', 'remote', 'set-url', 'origin', 'https://example.com/other.git')
        self.run_sync('--update', success=False)

    def test_local_commit_is_not_merged(self):
        self.run_sync()
        clone = self.sources / 'demo-source'
        self.git(clone, 'config', 'user.email', 'test@example.com')
        self.git(clone, 'config', 'user.name', 'Test')
        (clone / 'local.txt').write_text('local commit')
        self.git(clone, 'add', '.')
        self.git(clone, 'commit', '-m', 'local')
        self.advance()
        self.run_sync('--update', success=False)
        self.assertIn('v1', (self.skills / 'demo/SKILL.md').read_text())


if __name__ == '__main__':
    unittest.main()
