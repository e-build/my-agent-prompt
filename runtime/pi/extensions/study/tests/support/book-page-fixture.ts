/** A minimal book page with the given main body (hashes are placeholders; parsing does not verify them). */
export const bookPage = (body: string, conceptId = "cn-aaaa1111") =>
  `---\nconcept: ${conceptId}\n---\n<!-- study:book region=head hash=000000000000 -->\nh\n<!-- /study:book -->\n\n<!-- study:book region=main hash=000000000000 -->\n${body}\n<!-- /study:book -->\n\n<!-- study:book region=foot hash=000000000000 -->\nf\n<!-- /study:book -->\n\n## 메모\n`;
