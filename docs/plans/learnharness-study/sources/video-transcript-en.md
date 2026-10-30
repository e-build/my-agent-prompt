# Agent Harness for Learning Things — en 자동 자막

## 목차

- [출처](#출처)
- [타임스탬프 자막](#타임스탬프-자막)

## 출처

- 영상: https://www.youtube.com/watch?v=nfTDljFG2g0
- 채널: Eero Alvar
- YouTube 자동 생성 자막. 작성자 원고가 아니며 인식 오류 가능.
- 한국어 트랙의 원음 여부는 미확인. 영어 트랙을 분석의 주 근거로 사용.

## 타임스탬프 자막

[00:00] This is my system for learning with AI.
[00:02] What began as a simple teaching loop has
[00:04] now developed into a full system for not
[00:07] just learning new things, but also for
[00:09] strengthening existing understanding.
[00:11] So, same video structure as always,
[00:13] ideas and design first and then a live
[00:16] demo. So, a lot of things have changed
[00:19] since last time, but the goal has
[00:21] remained the same. So, we want to
[00:24] optimize learning. And what that means
[00:26] is maximizing understanding built per
[00:30] unit of mental effort spent. And
[00:32] specifically what we want is real,
[00:34] strong, and usable understanding. So, we
[00:37] can't just focus on minimizing mental
[00:40] effort, cuz clearly struggle with the
[00:43] material is where the most learning
[00:46] happens. I think the biggest risk in
[00:49] learning with AI is not hallucinations
[00:51] or errors by the LLM. It is accidentally
[00:55] skipping the struggle part and creating
[00:59] sort of an illusion of learning. So, we
[01:01] don't want to outsource the thinking,
[01:03] but what we can do is allocate our
[01:06] mental effort better so that a maximal
[01:09] share of it goes into direct interaction
[01:11] with the material, the stuff that most
[01:14] contributes to learning, and a minimal
[01:16] share to everything else. All right,
[01:18] next. I think it's helpful to make a
[01:20] distinction between understanding
[01:22] something and being able to use it.
[01:25] Let's say we're in a lecture. We're
[01:26] following along. We understand
[01:28] everything and we really do gain new
[01:30] understanding. But later, faced with a
[01:33] problem, the relevant ideas might never
[01:35] come to mind. And this doesn't mean that
[01:37] the understanding we built was somehow
[01:40] fake
[01:41] or something. It's just that following
[01:44] the reasoning and recognizing when and
[01:46] how to use it are two different things.
[01:49] And what I'm referring to here is recall
[01:52] in a very general sense. So, the right
[01:55] things, facts, connections, some
[01:59] problem-solving moves, whatever, but the
[02:01] right things come into mind in the right
[02:04] situations. And recall operates on cues.
[02:07] So, features of a situation that bring a
[02:10] certain piece of understanding to mind.
[02:13] A newly learned idea only really comes
[02:16] reliably to mind in the context that it
[02:18] was taught in. So, it starts off with a
[02:21] very narrow and weak set of cues. And
[02:24] then the job of practice is to broaden
[02:27] and strengthen that set of cues. All
[02:30] right, so two processes, at least for
[02:32] the purposes of this video and this
[02:34] system, we'll think of learning as two
[02:36] processes. Teaching installs
[02:39] understanding and practice solidifies it
[02:42] and makes it more usable. Now, if you
[02:44] want to optimize these processes, we
[02:46] have to realize that whatever optimal
[02:50] really means here,
[02:51] it's clearly defined relative to the
[02:54] learner's understanding. A step in
[02:56] teaching is redundant only relative to
[02:59] what you already understand and
[03:01] unreachable only relative to what you
[03:04] don't. There's no optimal lesson or
[03:07] optimal practice problem in the
[03:09] abstract. So, before anything can be
[03:11] optimized, the system needs a detailed
[03:13] picture of your understanding. So, not
[03:16] just what you understand, but how. Your
[03:19] mental models, your particular ways of
[03:22] reasoning about the thing with all of
[03:24] its nuances and subtleties, you know?
[03:28] And the right or wrong answer alone
[03:30] isn't able to provide that. I mean, two
[03:33] people can have the same wrong answer
[03:35] for very different reasons. The agent
[03:37] needs the data about the process and not
[03:40] just the final answer. And this is what
[03:42] the thinking fields in the system are
[03:45] for. So, almost every interaction has a
[03:47] field where you talk or type your raw
[03:51] thinking into basically just unfiltered
[03:54] messy stream of consciousness. Whatever
[03:57] comes to mind really. This gives the
[03:59] agents continuous data about your
[04:02] understanding. All right, so two
[04:04] processes. Let's go through both. First,
[04:08] the teaching, how we install new
[04:10] understanding. The core ideas and the
[04:12] general process from the previous
[04:14] version have remained the same. So,
[04:17] three phases. One, probe. Quick multiple
[04:20] choice questions that kind of binary
[04:22] search your edge on everything that the
[04:24] lesson will depend on. Two, plan. The
[04:27] agent reasons out the minimal dependency
[04:29] tree from what you already know to what
[04:32] you want to understand. And then three,
[04:35] teach. The goal level of understanding
[04:38] is something feeling obviously true. So,
[04:41] given a detailed picture of what you
[04:43] already hold as obviously true, the
[04:46] agent can simply walk down the path one
[04:49] reasoning step at a time in a way that
[04:51] each intermediate step lands as
[04:53] obviously true. And it's going to be
[04:55] very easy cuz it's just one reasoning
[04:58] step. And we just repeat that process
[05:00] until the goal itself is one of them and
[05:03] also lands as obviously true. And this
[05:06] is the shape of each individual step.
[05:09] First, you predict, then the agent
[05:11] teaches, and then it finally checks your
[05:14] understanding. So, before anything is
[05:16] explained, you get to predict the next
[05:19] move. And this not only gives the agents
[05:21] more context and even more of your
[05:22] thinking before the teaching, but it
[05:25] also serves as a very valuable learning
[05:27] opportunity. You try to reason out the
[05:30] next step yourself. So, two questions
[05:32] per step and this leads to a very
[05:34] Socratic back and forth. Errors and
[05:37] confusions will surface immediately and
[05:40] can get fixed before anything is built
[05:42] on top. The agent also has access to
[05:44] four kinds of sub-agents. A researcher
[05:47] for fact-checking, a PDF reader for
[05:50] reading PDFs efficiently, an SVG maker
[05:53] for creating diagrams, visuals, and
[05:55] other kinds of graphics, and a demo
[05:58] builder for creating interactive demos.
[06:02] Right, next, practice. And again, the
[06:05] goal here is to broaden and strengthen
[06:07] the set of cues that bring a piece of
[06:09] understanding to mind. So, the agent's
[06:12] job is not framed as making practice
[06:15] problems. It's posing demands for the
[06:18] learner to recall the right things given
[06:21] some set of cues. The practice session
[06:24] is basically just a stream of problems
[06:27] that adapt. And as you work through the
[06:30] problems, your thinking is going to give
[06:32] the agent very detailed evidence of
[06:35] where the difficulties actually are and
[06:38] what you struggle with. And then in the
[06:40] next problems, it can target and
[06:42] strengthen what needs to be
[06:44] strengthened. Really, the goal is recall
[06:48] that succeeds with effort. Enough
[06:51] difficulty that you have to work and
[06:53] struggle, but not so much that you can't
[06:55] make progress. There are two main ways
[06:58] that the difficulty can adapt. One, by
[07:01] changing how many ideas a problem
[07:04] combines. And two, how familiar the cues
[07:08] are. The thinking is submitted in
[07:10] chunks, and the agent is able to infer
[07:13] whether you actually solved it without
[07:15] you having to write down a final
[07:17] solution by hand. And this also means
[07:19] that when you really struggle, it's
[07:21] going to be able to give you the minimal
[07:23] hints, sort of little nudges toward the
[07:26] right directions. So, when you don't
[07:28] know something, it'll lead you to
[07:30] discovering the solution yourself
[07:32] instead of just giving it to you. All
[07:34] right, so so far we have established the
[07:37] two main systems. And now, the component
[07:41] that connects the two. All right, so we
[07:44] need some kind of persistent record that
[07:47] accumulates as you learn things. The
[07:50] format should be one that can hold a
[07:52] very large body of understanding in few
[07:55] enough tokens that is still useful for
[07:57] context sharing cuz that's the main use
[08:00] case here. But, we also want to preserve
[08:02] as much precision as possible,
[08:05] especially when it comes to how ideas
[08:07] connect. So, the model that I've decided
[08:10] to go with and what I've found to have a
[08:12] nice balance of both compression and
[08:16] precision
[08:17] is propositions and reasoning chains.
[08:21] These are extracted from the teaching
[08:23] sessions into one persistent structure
[08:26] of what you've been taught and it can be
[08:29] rendered as a very nice graph. Ideas and
[08:32] the reasoning that connects them growing
[08:35] out as you learn. All right, so what we
[08:37] get is an agent harness for learning
[08:41] things. Quick tangent, what are agent
[08:43] harnesses? Well, basically everything
[08:45] around an LLM that lets it explore and
[08:48] act in some external system. For a
[08:50] coding agent harness, the system is a
[08:53] computer. For a research harness, the
[08:55] system is the internet. So, for a
[08:58] learning harness then the system is your
[09:01] brain and the agent's job is to build
[09:05] understanding in there. In every other
[09:08] harness, the human is the operator, the
[09:11] one driving the agent. But, here you are
[09:14] the system being acted on. All right, I
[09:16] think this is enough talking. Uh let's
[09:19] see the system in action. All right,
[09:21] we're in the app now and yes, it is a
[09:24] desktop application. Completely free,
[09:27] open source. You just plug your own keys
[09:29] in and it works. But, anyways, this is
[09:32] the graph. So, we get a very nice
[09:34] overview of all the sessions, the core
[09:38] reasoning chains. Uh yeah, they can also
[09:40] form uh between sessions, like for
[09:42] example here. And then you can see the
[09:45] exact sessions that the node appeared
[09:48] in, and you can navigate to the original
[09:51] message. And apparently we also have a
[09:53] connection from the differential forms
[09:56] session to the gradient descent one.
[09:58] Yeah, this is the same differential
[10:00] forms session that I did last time. You
[10:02] can import your own notes any kinds of
[10:06] text files into this, which is what I've
[10:09] done here. But anyways, one more thing
[10:10] about the graph before we begin. Here
[10:13] the arrows, the links have a very
[10:16] precise meaning. They indicate the
[10:20] direction of reasoning. For example
[10:22] here, this and this lead to this. So, a
[10:26] cool thing that we can do is make the Y
[10:29] axis the depth of reasoning like this.
[10:33] So, now we have the bottom level Hold
[10:35] on, let me actually adjust the physics a
[10:37] bit. Yeah, so now we have the bottom
[10:39] level nodes
[10:40] at the bottom, and then the reasoning,
[10:44] the argumentation always goes upwards.
[10:46] And I
[10:47] I like this way of visualizing the
[10:49] sessions. But anyways, let's begin. All
[10:52] right, so we need a topic for the demo.
[10:55] And well, I'm thinking we learn LLMs.
[10:58] It's going to clearly fit into this,
[11:00] maybe build on top of neural networks,
[11:02] machine learning. That's also something
[11:04] I want to really learn.
[11:07] Teach me LLMs.
[11:09] Oh yeah, I'm I'm using this dictation
[11:11] here.
[11:12] So, if you don't use like WhisperFlow or
[11:15] some other dictation software, then you
[11:17] can just use this.
[11:19] Yeah, you just need a
[11:20] Deep Gram API key here, which is free.
[11:25] I want to learn and understand the
[11:27] transformer architecture, heavy math and
[11:30] theory focus.
[11:32] So yeah, let's begin. It's going to look
[11:34] at the graph.
[11:35] First question regarding the goal. I
[11:38] want to understand like a full
[11:39] conceptual understanding of what's going
[11:41] on under the hood.
[11:43] And then the thinking is always going to
[11:44] be sent along with the answers.
[11:48] Now, it's dispatch day research agent.
[11:50] That's good. Yeah, it's going to run in
[11:52] the background. Same mechanics as my
[11:55] interactive sub-agents. You can keep
[11:57] asking questions here. And oh, yeah.
[12:00] Another thing. I've got this new
[12:01] confidence slider here. So, you can
[12:03] assign a confidence level to your
[12:05] answer, which basically just means the
[12:07] probability that you think that your
[12:09] answer is correct. It's going to give
[12:11] really good data. A really easy way to
[12:14] give valuable data to the agents. By
[12:16] anyways, the thinking is still the main
[12:19] channel. But, yeah. First question.
[12:22] Okay, let's X and say in one token
[12:24] representation per row.
[12:27] Soft maxing the rows. Yes. Query key.
[12:31] And yeah, then we add the mask. And then
[12:33] value vector, right? I mean, a value
[12:36] matrix. What's the difference between
[12:37] these two? Oh, yeah. Columns or rows?
[12:40] It's It's rows. So, this one I'm fairly
[12:42] confident.
[12:44] And we got it. And then it's always
[12:46] going to have an explanation here as
[12:48] well. Right, next one. For one query
[12:52] None of these immediately like look
[12:55] familiar. But, this is just like
[12:57] applying the chain rule, right?
[13:00] Yeah, okay. Let me clean up the name
[13:02] also. LLMs.
[13:04] All right, next. The attention score
[13:06] uses Q transpose K over Now, in this
[13:09] probing phase, you'll notice that the
[13:11] agent finds my edge the edge of my
[13:14] understanding very quickly. And then it
[13:16] just drills into specifics to get a very
[13:19] detailed picture. For example, last time
[13:22] it spent a long time just locating uh,
[13:25] the edge. But, here cuz it has the graph
[13:28] context, it has found the, like, almost
[13:30] immediately. You'll see that we're at
[13:32] the edge of what I know just from the
[13:34] amount of thinking I put into every
[13:36] question. Variance one for the division
[13:39] is what I'm thinking.
[13:43] Okay, that took some work. You can see
[13:46] You can see the thinking. Also, research
[13:48] is finished.
[13:49] Uh,
[13:51] this up. So, the variance is going to be
[13:52] scaled by the square, so by nine, so 18.
[13:57] That would make the most sense.
[14:00] Zoomed in on the uncertainty in the
[14:02] previous question. Anyways, for rotary
[14:06] positional embeddings, I don't know what
[14:08] that is.
[14:10] But, just working it out from the
[14:12] formula, that makes sense. Transpose
[14:14] rules.
[14:15] Perfect. And, yeah, the
[14:18] the thinking is very important, cuz this
[14:20] was, like, algebraically very simple,
[14:23] but the answer and the confidence alone,
[14:26] uh, wouldn't be able to tell you that I
[14:27] have no idea what what this is.
[14:31] Uh, I'm not sure what this is asking.
[14:36] Uh, I don't know.
[14:39] Uh, I have no idea, really.
[14:43] All right, good.
[14:45] Well, I don't know.
[14:48] CX plus
[14:50] F and effects, uh, but this is a guess.
[14:55] The stuff at later positions, J is going
[14:58] to change because we made an edit to R
[15:00] at an earlier position.
[15:03] Okay, that was wrong.
[15:07] I'm fairly confident in this answer.
[15:10] Uh, a lot of thinking again. I'm giving
[15:12] it a ton of thinking at every step. Uh,
[15:15] it's going to get a very very detailed
[15:18] picture. Okay, yeah, it's concluding the
[15:19] assessment now. So, probing is done. All
[15:22] right, agent is planning now. It's
[15:24] dispatching more researchers. That's
[15:26] good. We want to guarantee correct
[15:28] information. Now, it's drawing the
[15:31] dependency graph.
[15:33] All right, there we go. This is what we
[15:35] got. Yeah, looks good. Accept the plan.
[15:38] And then, teaching is going to begin
[15:41] first with a prediction. And yeah, the
[15:43] map is going to be visible here on the
[15:45] side and it's going to update. So, you
[15:47] you're always going to see where you
[15:49] are. Um but anyways, the same embedding
[15:51] matrix E is used
[15:54] 50. Okay, good. All right, now first
[15:57] step. And there's this thinking while
[15:59] reading field to give the agent even
[16:02] more context cuz it's important that
[16:04] you're going to have like questions
[16:05] while you read. You're going to be
[16:06] thinking about things. I just like to
[16:08] have this on at almost all times. Two
[16:11] independent matrices, A for input
[16:13] embedding lookup and B for output
[16:15] scoring.
[16:17] All right, okay.
[16:20] And then, the verification question.
[16:23] Consider the scalar analog.
[16:26] So, 18.
[16:29] All right, so I'm just going to have a
[16:30] time lapse here.
[16:32] The teaching style and the methodology
[16:35] is the same as last time. And this is of
[16:37] course something that you can edit. All
[16:40] the system prompts are visible. You can
[16:42] edit and tweak them as you wish. But
[16:44] yeah,
[16:45] methodology is fundamentally the same,
[16:47] but this time it gets even more of your
[16:50] thinking per reasoning step cuz there
[16:52] are two questions and three thinking
[16:55] fields per step. So, the explanations
[16:58] are going to be even more tightly fitted
[17:01] to your specific understanding at every
[17:04] step of the way. And yeah, this also
[17:06] keeps it very interactive.
[17:09] No long walls of text. But, this brings
[17:12] up a very important points about why
[17:16] walls of text are bad in this context
[17:19] cuz cuz it's not about
[17:22] long pieces of text being unpleasant to
[17:25] read or something like that. No,
[17:28] it is precisely because we want to feed
[17:31] the agent data about your understanding
[17:34] as continuously as possible. That's the
[17:38] reason why. All right, now we've got an
[17:40] extraction process going on here. It
[17:42] says distilling the session so far into
[17:45] reasoning chains.
[17:48] All right, the extraction finished.
[17:49] Yeah, we got a LLM session tree here.
[17:52] Let me adjust the physics a bit. Yeah,
[17:54] so this is the session so far. Yeah, and
[17:56] it's making connections to the other
[17:58] ones. All right, now that we've got
[17:59] these in the graph, what we can do is
[18:02] run a practice session on them. So, we
[18:04] just select the reasoning chains from
[18:07] this view, which just shows the raw
[18:10] reasoning chains, ideas and how they
[18:12] connect. But anyways, we select the ones
[18:14] that we want to practice and then we
[18:16] start a practice session. LLM's math
[18:19] focus. Yes.
[18:21] We get our first problem.
[18:23] A model receives a token matrix X and
[18:26] computes
[18:28] All right, so immediately the
[18:30] multiplying by the weight matrix and
[18:32] it's not going to I mean that keeps the
[18:34] rows of X independent. They don't
[18:37] influence each other and value acts
[18:39] coordinate-wise. So, everything is just
[18:41] computed in parallel here.
[18:46] All right, I got to thinking. All right,
[18:48] so it seems like I wasn't being rigorous
[18:50] enough here. So, gave me a little hint
[18:52] so I have that right idea, it seems
[18:54] like, but I need to write down Z4
[18:58] explicitly in terms of X4. Okay.
[19:03] Is that sufficient? Let's see. No
[19:06] coordinate expansion needed. Keep W and
[19:08] U as matrices.
[19:10] Oh, yeah, that's
[19:11] dotted with the eyes column of you.
[19:14] That's what I've got currently.
[19:17] All right, so that was one problem. Oh,
[19:19] yeah, and also all the problems are we
[19:22] we can look at the metadata here. This
[19:24] one had three nodes that it was testing.
[19:27] So, the targets of that problem were
[19:29] these three nodes. And because all of
[19:33] the problems are tagged with their exact
[19:35] propositions, well, I haven't
[19:37] implemented it yet, but that's going to
[19:39] allow us to get some very targeted
[19:42] assessment data. This currently the
[19:44] graph doesn't tell you anything about
[19:46] how well you understand something. It
[19:48] just shows what has been covered. Yeah,
[19:50] the next step is to wire the assessments
[19:53] back into the graph, but that's that's
[19:56] later on. But anyways, next problem. A
[19:58] layer computes
[20:00] So, we get delta Y is 0 0.
[20:06] Yeah, I think you get the idea here. All
[20:08] right, so a few more things before we
[20:09] finish. The agents here have got the
[20:11] basic read-only tool sets of read, ls,
[20:16] find, and grep. So, what you can do is
[20:18] well, for teaching sessions, you can
[20:20] obviously you can give them your own
[20:22] sources, your own materials.
[20:25] Um let me do find my abstract algebra
[20:29] lecture notes.
[20:31] Teach me.
[20:33] Yeah, I don't know. Not even giving it a
[20:35] path here. Um hopefully finds it.
[20:38] Uh it's it's hidden away
[20:41] somewhere. Okay, yeah, I found it.
[20:43] Perfect. And also, for the practice
[20:46] sessions, you don't have to run them
[20:48] based off of the reasoning chains. You
[20:51] can, for example, just give them your
[20:53] own problems. For example, I've got this
[20:55] complex analysis problem here. I'll give
[20:58] it the path, then it's going to load
[21:00] that into the practice session, and
[21:02] we're going to be able to do that
[21:03] problem.
[21:05] So, yeah, now it's reconstructed the
[21:07] problem here and we're able to work on
[21:10] it in the practice session. Uh cuz I
[21:13] think this is a very comfortable format.
[21:16] Uh so, yeah. I don't think I've demoed
[21:18] the interactive demos yet. Uh let's go
[21:20] to an older session here, gradient
[21:23] descent session. Make a visual SGD demo.
[21:27] Yeah, it's going to know how to do this
[21:30] proactively when it fits the session and
[21:32] helps with the teaching. Uh now, I'm
[21:35] just forcing it to make one.
[21:38] Well, let's see what it comes up with.
[21:40] All right, we got a
[21:42] flashbang. Um and this is why I have
[21:44] this switch over here so that you can
[21:48] invert the colors.
[21:49] Um All right, we got a demo.
[21:53] Okay, yeah, we can set the starting
[21:55] point, learning rate. Anyway, I think
[21:58] you get the idea. Okay, so that's the
[22:01] system as of now. Uh cuz this is
[22:05] Uh this is really only the beginning. I
[22:08] think I've got the I think I've got the
[22:09] basic ideas, the general shapes
[22:13] down. So, now the experimentation
[22:17] can really begin. So, I'm very excited
[22:20] to hear your thoughts, your ideas, what
[22:22] works, what doesn't, you know.
[22:26] Whatever comes to mind, really.
[22:29] But anyways, I guess that's it. I'll
[22:31] have all the links in the description.
[22:33] So, yeah. Uh thanks for watching. I'll
[22:36] see you in the next one.
