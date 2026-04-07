## Scrap
- https://github.com/msitarzewski/agency-agents
- https://github.com/vectorize-io/hindsight

## idea
- opencode 에서 OmO 없이 opencode dcp 최적화 높이기
  - https://github.com/code-yeongyu/oh-my-openagent/pull/529
- cmux 로 agent orchestration 워크플로우 정의하기
  - ref - /Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/basket/cmux-orchestration
  - https://x.com/elvissun/status/2025920521871716562?s=46
  - gemini brainstorming
    ```markdown
    - 나: 
      - Opencode 에서 codex를 호출할수 잇는 방법들을 커뮤니티와 웹탐색을 통해 정리 해줘 
      Codex모델을 말하는데 아니라 터미널 제품인 Codex를 호출해서 상호작용하고싶은거야
  
    - gemini:
      - OpenCode(OpenSource AI Coding Agent) 내에서 터미널 도구인 Codex CLI를 호출하고 상호작용하는 방법은 크게 3가지로 나뉩니다.
        질문하신 의도대로 Codex를 모델명이 아닌, 로컬 파일을 읽고 명령을 실행하는 **'터미널 기반 도구'**로서 OpenCode 안에서 부려 먹는(?) 구체적인 방법들을 정리해 드립니다.
        1. 전용 플러그인 사용 (가장 추천)
      
        OpenCode 커뮤니티에는 OpenAI의 Codex CLI 제품을 OpenCode TUI 환경에 직접 통합해주는 플러그인이 존재합니다.
      
            OpenAI Codex Auth 플러그인: 이 플러그인은 ChatGPT Plus/Pro 계정의 OAuth 인증을 통해 OpenCode가 Codex 백엔드에 직접 연결되도록 돕습니다.
      
            작동 방식: OpenCode 터미널 내부에서 별도의 인증 없이 Codex의 기능을 호출할 수 있게 하며, OpenCode의 build 모드와 Codex의 로컬 실행 능력을 결합합니다.
      
            설치 예시:
            Bash
      
            # OpenCode 내에서 플러그인 설치 명령 (에코시스템에 따라 상이)
            opencode plugin install openai-codex-auth
      
        2. MCP(Model Context Protocol)를 통한 도구 연결
      
        2026년 현재 AI 업계의 표준인 MCP를 이용하면 OpenCode가 Codex CLI를 하나의 '도구(Tool)'로 인식하게 만들 수 있습니다.
      
            설정 방법: ~/.config/opencode/opencode.json 파일의 mcp 섹션에 Codex를 로컬 서버로 등록합니다.
      
            장점: 이렇게 연결하면 OpenCode에게 "Codex를 써서 이 파일 구조를 분석해줘"라고 자연어로 명령했을 때, OpenCode가 직접 Codex CLI를 실행하여 결과를 가져옵니다.
      
            설정 예시:
            JSON
      
            {
              "mcp": {
                "local": [
                  {
                    "name": "codex-cli",
                    "command": "npx",
                    "args": ["-y", "@openai/codex", "mcp-server"]
                  }
                ]
              }
            }
      
        3. 커스텀 슬래시 명령어(Slash Commands) 등록
      
        플러그인이나 MCP 설정이 번거롭다면, OpenCode의 commands 기능을 이용해 Codex 호출 단축키를 만들 수 있습니다.
      
            동작: OpenCode 프롬프트 창에 /codex [명령]을 입력하면 터미널의 codex CLI가 실행되도록 랩핑(Wrapping)하는 방식입니다.
      
            활용 예시:
      
                /codex review: Codex CLI의 코드 리뷰 기능을 OpenCode 세션 내에서 즉시 실행.
      
                /codex exec "npm test": Codex를 도구 삼아 테스트를 수행하고 결과를 OpenCode 컨텍스트로 반환.
      
        💡 요약 및 팁
      
            설치 확인: 먼저 터미널에 Codex CLI가 깔려 있어야 합니다. (npm i -g @openai/codex)
      
            도구로서의 활용: OpenCode는 '두뇌' 역할을 하고, Codex는 '현장 요원(Local Agent)' 역할을 수행하게 됩니다.
      
            인증: Codex CLI를 처음 실행할 때 codex auth를 통해 로그인을 마쳐야 OpenCode 내에서도 문제없이 작동합니다.
      
        단순히 OpenCode 터미널 안에서 codex라고 타이핑해서 쓰는 걸 넘어, MCP로 연결해 두시는 것이 OpenCode가 스스로 Codex의 기능을 판단해서 호출하게 만드는 가장 똑똑한 방법입니다.
      
        더 구체적인 설정 파일(opencode.json) 예시가 필요하신가요?
  
    - 나: 
        - Codex가 정상적으로 호출됐는지 알아야하잖아 미리 띄워둔 cmux pane 에서 확인할수잇으면 좋을것 같아 참고로 cmux는 오타가아니야
  
    - gemini: 
      - **cmux(Custom Multiplexer)**를 사용 중이시군요! 일반적인 tmux와 달리 cmux는 세션 관리와 패널(Pane) 제어에 특화되어 있어, OpenCode가 호출하는 Codex의 동작 과정을 실시간 모니터링하기에 아주 적합한 환경입니다.OpenCode에서 호출된 Codex의 실행 결과나 로그를 별도의 cmux 패널에서 확인하는 가장 확실한 방법들을 정리해 드립니다.1. FIFO (이름 있는 파이프)를 이용한 로그 리다이렉션OpenCode가 Codex를 호출할 때 발생하는 표준 출력(stdout)을 cmux의 특정 패널로 쏘아 보내는 방식입니다.cmux 패널 1 (로그 대기): 임시 파이프 파일을 만들고 출력 대기 상태로 둡니다.Bashmkfifo /tmp/codex_log
        cat /tmp/codex_log
        OpenCode/Codex 설정: OpenCode의 Codex 호출 명령어 뒤에 로그를 파이프로 넘기도록 설정합니다. (환경 변수나 MCP 설정 파일에 추가)Bash# 예시: Codex 실행 시 출력을 파이프로 전달
        codex [command] > /tmp/codex_log 2>&1
        이렇게 하면 OpenCode가 Codex를 호출할 때마다 cmux 패널 1에 실시간으로 실행 로그가 찍힙니다.2. cmux의 capture-pane 활용 (상태 확인)Codex가 정상적으로 호출되어 특정 작업을 수행 중인지, cmux 패널의 내용을 OpenCode가 직접 읽어오거나 반대로 감시하게 할 수 있습니다.스크립트 방식: cmux capture-pane -t [패널ID] -p 명령어를 사용하면 해당 패널에 찍힌 Codex의 마지막 상태를 텍스트로 가져올 수 있습니다.응용: OpenCode의 커스텀 명령어로 Check Codex를 등록해두고, 실행 시 cmux 패널의 내용을 팝업으로 띄우도록 구성 가능합니다.3. TCP/Unix Socket 로그 서버 (고급 설정)Codex CLI는 실행 시 디버그 로그를 외부로 보낼 수 있는 옵션을 지원하는 경우가 많습니다.설정: cmux 패널에서 nc -l 9999 (넷캣) 등으로 포트를 열어둡니다.연결: OpenCode 내부에서 Codex를 호출할 때 로그 레벨을 높이고 해당 포트로 전송하도록 구성하면, cmux 패널이 마치 전용 대시보드처럼 작동합니다.4. cmux 환경을 고려한 통합 워크플로우cmux의 레이아웃 기능을 활용해 아래와 같이 화면을 분할해 두는 것을 권장합니다.패널 위치역할비고좌측 (Main)OpenCode TUI실제 코딩 및 AI 대화 수행우측 상단Codex 실시간 로그tail -f 또는 파이프를 통해 호출 상태 모니터링우측 하단시스템 리소스/프로세스htop 등을 띄워 Codex 프로세스 생존 확인💡 팁: 호출 성공 여부 시각화OpenCode에서 Codex 호출이 성공했는지 더 직관적으로 알고 싶다면, 호출 스크립트 끝에 cmux의 상태 표시줄(Status Bar) 색상을 변경하는 코드를 넣으세요.Bash# Codex 호출 성공 시 cmux 패널 테두리를 녹색으로 변경 (예시 명령어)
        codex [args] && cmux set-option -t 1 pane-border-style "fg=green"
        현재 cmux에서 사용 중인 특정 레이아웃이나, OpenCode에서 Codex를 호출할 때 발생하는 구체적인 오류 메시지가 있나요? 해당 내용에 맞춰 스크립트를 더 다듬어 드릴 수 있습니다.
  
    - 나:
      - 흠 애초에 tui 가 제공되는 환경이잖아 진짜 사람이 이용하는것 처럼 cmux 안에서 opencode가 코덱스를 활용할수없을까? 그리고 opencode가 opencode를 사용해도되
  
    - gemini:
      - 아, 아예 OpenCode가 백그라운드 프로세스나 API 호출을 넘어서 **'진짜 사람처럼 TUI 화면을 보며 타이핑하고 상호작용'**하게 만들고 싶으신 거군요! 이거 정말 멋진 접근입니다.
    
      최근 AI 에이전트 분야에서도 환경(Terminal)과 상호작용하기 위해 이처럼 사람의 행동(키보드 입력, 화면 읽기)을 모방하는 방식을 많이 채택하고 있습니다. 게다가 OpenCode가 다른 OpenCode를 부하 직원처럼 다루는 다중 에이전트(Multi-Agent) 방식도 충분히 가능합니다.
    
      cmux의 세션 및 패널 제어 기능을 활용해 이를 구현하는 구체적인 아키텍처를 정리해 드립니다.
      핵심 원리: Action(입력)과 Observation(관찰) 루프
    
      OpenCode가 다른 TUI(Codex 또는 Sub-OpenCode)를 조종하려면, 사람이 눈으로 보고 손으로 치는 과정을 cmux 명령어로 대체하면 됩니다.
      1. Action (키보드 입력 시뮬레이션)
    
      OpenCode가 자기가 띄워둔 다른 패널로 직접 타이핑을 치게 만듭니다. cmux (또는 tmux 기반) 환경에서는 send-keys 명령어가 이 역할을 합니다.
    
          실행 예시: (OpenCode 내부 로직이나 스크립트에서 실행)
          Bash
    
          # 대상 패널(예: 패널 1)에 명령어 타이핑 후 Enter 누르기
          cmux send-keys -t 1 "codex --mode tui" C-m
    
          # TUI 안에서 방향키나 특수키 누르기 (사람이 고르는 것처럼)
          cmux send-keys -t 1 Down Down Enter
    
          # 텍스트(코드나 프롬프트) 밀어넣기
          cmux send-keys -t 1 "이 함수에 대한 리뷰를 작성해줘" C-m
    
      2. Observation (화면 읽기 / 눈 역할)
    
      명령을 내렸으면 Codex(또는 부하 OpenCode)가 TUI 상에 뱉어낸 응답을 읽어야 합니다. 앞서 언급한 capture-pane을 단순 로그 확인용이 아니라 **화면 스크래핑(Screen Scraping)**용으로 씁니다.
    
          실행 예시:
          Bash
    
          # 패널 1의 현재 화면 상태를 텍스트로 캡처하여 파일로 저장
          cmux capture-pane -t 1 -p > /tmp/pane_1_screen.txt
    
          작동 방식: Main OpenCode는 이 /tmp/pane_1_screen.txt 파일을 읽어들여 Codex가 현재 어떤 상태인지, TUI 렌더링(메뉴 선택창, 텍스트 출력 등)이 어떻게 바뀌었는지 파악(파싱)합니다.
    
      적용 시나리오: OpenCode가 OpenCode를 부려먹기
    
      이 원리를 응용하면 '메인 매니저(OpenCode)'와 '실무자(OpenCode/Codex)' 형태의 워크플로우를 짤 수 있습니다.
    
          초기 세팅 (cmux 분할):
    
              패널 0: Manager OpenCode (명령을 내리고 조율하는 역할)
    
              패널 1: Worker OpenCode A (프론트엔드 작업 전용)
    
              패널 2: Codex (로직 검증 및 터미널 도구)
    
          작업 지시 (send-keys):
    
              Manager가 패널 1로 이동해 작업을 지시합니다.
    
              cmux send-keys -t 1 "/workspace open src/App.jsx" C-m
    
          상태 감시 (capture-pane):
    
              Manager는 주기적으로 패널 1과 2의 화면을 캡처하여 작업이 끝났는지(TUI의 진행 상태 바가 100%인지, 특정 프롬프트가 다시 떴는지) 확인합니다.
    
          결과 통합:
    
              Worker들이 작업을 마치면 Manager가 결과를 종합하여 최종 리포트를 작성합니다.
    
      구현을 위한 현실적인 팁 (주의사항)
    
          ANSI 이스케이프 코드 처리: TUI는 화면에 색상을 입히거나 커서를 이동하기 위해 특수 문자열(ANSI 코드)을 많이 사용합니다. capture-pane으로 화면을 읽을 때 이 특수문자들이 섞여 들어오면 AI가 글씨를 읽기 어려워하므로, 텍스트만 추출하는 정규식 필터링을 거치는 것이 좋습니다.
    
          딜레이(Sleep) 설정: 사람이 타이핑할 때처럼 약간의 대기 시간이 필요합니다. send-keys로 명령을 보내고 TUI가 렌더링 될 때까지 0.5초~1초 정도 기다린 후 화면을 캡처해야 정확한 결과를 얻을 수 있습니다.
    
      이처럼 cmux의 send-keys와 capture-pane을 API처럼 활용하는 파이썬/배시 래퍼(Wrapper) 스크립트를 하나 만들어 두시면, OpenCode가 완벽하게 사람 행세를 하며 다른 툴들을 다룰 수 있습니다.
    
      혹시 이 제어 로직을 Python 같은 스크립트 언어로 직접 구현하실 계획인가요, 아니면 OpenCode 내부의 플러그인 형태로 개발하실 생각인가요?
    ```
- code 탐색 효율 정확도 향상 도구 탐색 (with indexing, embedding)
  - https://github.com/abhigyanpatwari/GitNexus?tab=readme-ov-file
