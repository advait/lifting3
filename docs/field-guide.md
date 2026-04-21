# Advait’s field guide to building agent harnesses in 2026

## **1\. Why agent building feels different in 2026**

Frontier models crossed a threshold in late 2025.

The important shift is long-horizon execution. A good model can stay coherent inside a loop for a long time: inspect intermediate results, choose the next action, call tools, write code, run it, evaluate the output, correct course, and continue. Models now generate just-in-time code that stitches together API calls, data transformations, and task-specific logic in service of the goal.

That changes where the difficulty sits. In the previous era, a lot of agent work was prompt choreography. In 2026, the bottleneck is the runtime, or harness, around the model. The harness has to let the model do real work while remaining correct in the presence of flaky clients, partial streams, retries, reconnects, and server restarts.

That immediately raises a new set of questions:

- Where does state live?
- What is the authoritative event log?
- How are tool calls validated and executed?
- Which operations are safe to retry?
- What can be replayed safely?
- Where do generated files and other artifacts go?
- How does streaming work?
- What happens when clients disconnect and reconnect?
- How do multiple clients observe the same session consistently?
- How does untrusted agent-generated code execute safely?
- Where are authorization boundaries enforced?

These are not edge cases. They show up as soon as your agent does anything real.

This is why a lot of agent demos look magical for five minutes and then break the moment you push on them. The model is often fine. The prompt is often fine. The plumbing is not.

This guide is written to make those problems explicit. I have a strong point of view that you should use [Cloudflare Agents](https://agents.cloudflare.com/) because it gives you most of this plumbing out of the box. The guide should still be useful if you choose a different stack. The alternatives are straightforward: build your own runtime, or intentionally downscope your system so these problems never appear. What you cannot do is avoid them by pretending they are not there.

The goal is to help you recognize the real problems early, avoid dead-end architecture, and focus on building product leverage instead of rebuilding agent infrastructure from scratch.

In later sections, when implementation detail matters, I will end with two short blocks.

> **If hand-rolling:** means the default pattern I would use if I were building the runtime myself.

**On Cloudflare:** means how I would realize the same idea using Cloudflare’s stack.

## **2\. What exactly is an agent?**

An agent is a remarkably simple structure. At its core, it’s just a loop:

1. Receive new input from the user or the outside world
2. The LLM reads the current context and decides what to do next
3. If the LLM emits tool calls, the runtime executes them and appends the tool results back into context
4. Repeat until the LLM emits a final answer, requests approval, or otherwise stops

That is the core mechanic. Everything else is runtime.

There is a small set of primitives involved:

- **Turn**: One iteration of the loop. The model reads the current context and emits the next thing that should happen.
- **Run**: A sequence of turns that ends in a stopping condition such as a final answer, a handoff, a failure, or a request for approval.
- **System prompt**: The engineer-written instructions that define the goals, rules, and constraints of the agent.
- **User message**: Input from the outside world that gives the agent a goal, clarifies intent, or changes direction.
- **Assistant message**: Visible output from the model to the user.
- **Thinking block**: Provider-specific reasoning output that may or may not be exposed through the API. Treat this as optional.
- **Tool call**: A structured request from the model asking the runtime to perform some action.
- **Tool result**: The output of a tool call, appended back into context as a fresh observation.
- **Artifact**: A durable output created during the run such as a file, patch, report, image, log, or code bundle.
- **Context**: The accumulated state presented to the model on the next turn. Usually some combination of messages, tool results, and runtime metadata.
- **Runtime / harness**: The machinery around the model that validates tool calls, executes them, manages state, persists history, handles streaming, and decides what happens next.

The key mental model is simple: the model does not directly touch the world. It reads context and emits structured outputs. The runtime decides what those outputs mean, whether they are allowed, how they execute, how results are persisted, and how the next turn is constructed.

Once this clicks, most agent systems stop looking magical. They start looking like a loop over a small set of well-defined objects.

## **3\. The agent is a state machine with authoritative history**

An agent runtime is a state machine.

At any moment, the session has concrete state: messages, pending tool calls, completed results, run status, partial streams, artifacts, approvals, workspace metadata, and whatever else is required to continue correctly.

As events happen, the state machine transitions. A user message arrives. A tool call starts or finishes. A stream advances. A sandbox exits. An approval lands. A client reconnects. A timeout fires. Each event should move the system from one valid state to another valid state.

Once you model the runtime this way, a bunch of design questions get simpler:

- You can persist current state for fast resume instead of reconstructing the world from chat text.
- You can define valid transitions and reject impossible ones rather than letting the system drift into ambiguous in-between states.
- You can render the UI as a pure projection of state instead of bolting product behavior onto chat bubbles.
- You can make pause, resume, cancel, retry, fork, handoff, and multi-client sync explicit operations over the same underlying session.

If the agent is a state machine, then durability is the question of how that state machine survives contact with reality.

A serious runtime usually needs two related things: a materialized current state for fast resume and rendering, and authoritative history for correctness.

A chat transcript is not enough. The transcript is only one projection of the system. It usually omits the details that determine correctness: tool execution, approvals, artifact mutations, retries, cancellations, sandbox lifecycle, and other runtime state.

The right question is not “what text did the model produce?” The right question is “what happened in the system?”

One important caveat: replaying history and replaying side effects are different things. Reconstructing state should be safe. Re-running tool calls, mutating external systems, or re-executing generated code requires a separate set of rules.

**If hand-rolling:** use one authoritative owner of session state, keep a durable record of semantic state transitions, materialize current state for fast resume and rendering, and treat replay as reconstructing state rather than re-running effects.

**On Cloudflare:** treat the [Durable Object](https://developers.cloudflare.com/durable-objects/) as the authoritative owner of the session and use [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) as the default chat layer. Drop to [`AIChatAgent`](https://developers.cloudflare.com/agents/api-reference/chat-agents/) when you need full control over the model loop. Add [`Sessions`](https://developers.cloudflare.com/agents/api-reference/sessions/) when you need branching or searchable history.

## **4\. Idempotency and in-flight side effects**

Replay is not the dangerous part.

If authoritative history already contains a tool call and its corresponding tool result, replay should just reconstruct state. The runtime reads history, rebuilds current state, and moves on. No tool execution is required.

The dangerous part is resumption after a crash during an effectful action.

A tool call may have been emitted. Execution may have started. The external side effect may even have happened. Then the worker crashes, the server restarts, the network flakes, or the client disconnects before the runtime durably records the outcome.

Now you have an ambiguity problem. From the runtime’s perspective, the effect may have happened or not. The outside world may already be mutated, but the runtime does not know that durably. If you resume by naively issuing the action again, you risk duplication.

Some actions do not support idempotency keys. In those cases, say so explicitly. Your system may produce duplicate actions at those boundaries.

**If hand-rolling:** every effectful tool needs an idempotency story. If it does not, say so explicitly and treat duplicate execution as part of the contract. When possible, the usual mitigation is a durable identity key for the effect:

- Generate and persist a stable idempotency key before execution
- Use that key when performing the effect, for example `INSERT ... ON DUPLICATE KEY UPDATE`

**On Cloudflare:** the same rule applies. Persist enough state in the [Durable Object](https://developers.cloudflare.com/durable-objects/) or a [Workflow step](https://developers.cloudflare.com/agents/api-reference/run-workflows/) before firing the effect, and use [Workflows](https://developers.cloudflare.com/agents/api-reference/run-workflows/) when you want the platform to own more of the retry boundary.

## **5\. Tools are structured interfaces, and the runtime enforces auth**

A tool is a structured interface between the model and the runtime. At minimum, a tool definition contains a name, a description, an input schema, and an execution path.

The input schema is usually a [JSON schema](https://json-schema.org/). It tells the model what arguments it is allowed to emit. It does **not** say how the request gets executed, whether the action is authorized, or what side effects are allowed. That part belongs to the runtime.

When the model emits a tool call, the runtime has to validate the arguments, check authorization and preconditions, decide how to execute the action, record the lifecycle transition durably, and append the result back into context. The model proposes a structured action. The runtime decides whether it is valid, whether it is allowed, how it runs, and how the result is represented.

A tool call from the model is a request. It is not permission.

Tool semantics and execution substrate are different things. A tool like `searchAccount` might be satisfied by an in-process function, a backend service, generated code in a lightweight runtime, or arbitrary bash in a full sandbox. Same tool surface. Very different execution model.

If you give the model a giant pile of vague tools, it will use them vaguely. If you give it a small set of crisp capabilities, it can compose them surprisingly well.

**If hand-rolling:** prefer narrow, capability-shaped, user-scoped tools over broad query or admin tools. Keep the model away from broad credentials, separate reads from effectful writes, put authorization in the runtime rather than the prompt, and make every effectful action auditable.

**On Cloudflare:** [`AIChatAgent`](https://developers.cloudflare.com/agents/api-reference/chat-agents/) and [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) give you a convenient tool loop, not a convenient authorization model. Enforce auth yourself in every tool. This matters more, not less, once you add [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) or [Sandbox](https://developers.cloudflare.com/sandbox/).

## **6\. The execution ladder**

Not all tool execution is the same.

There are different levels of execution power. As you move up the ladder, the model gets more flexibility and more leverage. It also gets more ability to hurt you. This is one of the core tradeoffs in agent design.

A useful mental model is four levels:

### **Level 0: No tools**

The model can only emit text.

This is the default chat experience. It can explain, summarize, brainstorm, and reason in public. It cannot inspect the outside world, mutate anything, or generate artifacts beyond text. Useful for some tasks. Very limiting for most real agent work.

### **Level 1: Harness-executed tools**

The model emits structured tool calls. The runtime executes them directly.

This is the standard tool-calling setup. The model never executes code itself. It asks for named capabilities like `getAccount`, `searchTickets`, or `sendEmailDraft`. The runtime validates the arguments, enforces authorization, performs the action, and appends the result back into context.

This level is often enough for surprisingly capable systems. It is also the safest place to start. The auth boundary is usually implied by the tool semantics. A user-scoped tool can be made very safe if the runtime enforces the scope correctly.

### **Level 2: Generated code in a lightweight runtime**

The model generates code, and that code runs inside a constrained execution environment.

This is a different class of system. The model is no longer limited to the tool shapes you anticipated in advance. It can write just-in-time logic that stitches together multiple APIs, performs transformations, reshapes data, and builds one-off workflows tailored to the task at hand.

That flexibility is powerful. It is also why the execution environment matters. Once the model can generate code, you need a real sandbox and a real capability model. You do not want to hand it raw tokens and hope for the best.

[Cloudflare Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) are an example of this shape. The model can generate JavaScript that runs in a lightweight isolated environment with explicit bindings instead of ambient credentials.

### **Level 3: Full sandboxes**

The model generates arbitrary code or bash that runs in a full sandboxed machine.

This is the highest-leverage version. The model gets a real Linux environment, a filesystem, installed tools, background processes, and all the usual power of a computer. At this level, the agent can do things that are awkward or impossible to express as predeclared tools. It can inspect files, run CLIs, write programs, execute them, patch bugs, and keep iterating.

This is also where the risk model changes most dramatically. You are no longer exposing a menu of fixed actions. You are exposing a programmable compute environment. Isolation, auth, artifact persistence, network control, and observability all become central.

The important point is that these levels are not just different implementation details. They imply different product shapes.

Level 1 systems are usually best when the domain is structured, the action surface is known, and strong control matters.

Level 2 systems are useful when the model benefits from synthesizing task-specific logic, but you still want a constrained execution model.

Level 3 systems are best when the work naturally looks like operating a computer.

A lot of teams jump straight to maximum power because it feels exciting. Sometimes that is right. Often it is not. The correct level is the minimum execution power that still lets the agent do meaningful work.

**If hand-rolling:** start at Level 1. Move up the ladder only when predeclared tools are clearly the bottleneck.

**On Cloudflare:** start with [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) plus its workspace tools, then add [`Codemode`](https://developers.cloudflare.com/agents/api-reference/codemode/), [Browser Run](https://developers.cloudflare.com/browser-run/), or [Sandbox](https://developers.cloudflare.com/sandbox/) only when the product truly needs that extra execution power.

## **7\. Generated code changes the shape of the system**

Once the model can generate code reliably, the architecture changes.

In the old tool-calling frame, the model selected from a menu of actions the engineer had already anticipated. In the generated-code frame, the model can synthesize the missing glue itself. It can write a short program that fans out to multiple APIs, normalizes the results, filters them, computes a derived answer, writes a file, then uses that file in a later step.

This is a big deal.

It means you no longer need to pre-package every useful workflow as a first-class tool. The model can construct task-specific logic just in time. That dramatically expands the surface area of problems it can solve.

It also means the runtime now has to support a different class of behavior:

- Temporary files
- Intermediate programs
- Local transformations
- Dependency management
- Logs and stdout/stderr
- Background processes
- Multi-step artifact production
- Safe execution of untrusted code

At that point, “tool calling” is too narrow a frame. The model is not just calling tools. It is using a computer.

This is why the execution ladder matters so much. At Level 1, most of the system behavior is predeclared by the engineer. At Level 2 and Level 3, the model can synthesize new behavior at runtime. That gives you much more leverage. It also creates a much larger correctness and safety surface.

A few practical consequences follow:

- You need somewhere for generated code to run
- You need somewhere for generated artifacts to live
- You need observability into what the code actually did
- You need clear controls on what resources the code can access
- You need a plan for what happens when execution dies halfway through

A lot of teams still build agents as if text is the main output and tools are the only way work gets done. That is increasingly stale. In many of the most interesting systems, the model writes code because code is the most efficient way to solve the problem in front of it.

Once that is true, the harness stops being a thin wrapper around an API call. It becomes the environment in which the agent actually works.

**If hand-rolling:** this is the point where hand-rolling gets much less attractive for GG-internal work. External sandbox vendors like Modal, E2B, or Daytona may not be practical if vendor approval is not already in place, and a custom AWS sandbox is easy to get subtly wrong. Treat that as a reason to stay on the narrowest execution level you can, or to prefer a platform that already gives you a real execution ladder.

**On Cloudflare:** use [`Codemode`](https://developers.cloudflare.com/agents/api-reference/codemode/) plus [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) for Level 2 generated code, [Sandbox](https://developers.cloudflare.com/sandbox/) for Level 3 full-machine execution, and [Browser Run](https://developers.cloudflare.com/browser-run/) when the artifact is a rendered page rather than a filesystem or process tree.

## **8\. Streaming is part of the runtime**

Streaming is not just a UI flourish.

It is part of how the runtime exposes state transitions in real time.

At the model layer, streaming usually starts as token or text deltas. The provider emits partial output as it is generated. At the runtime layer, there is usually more going on than text alone:

- The model starts responding
- Text begins streaming
- A tool call is emitted
- Tool execution starts
- A sandbox spins up
- Logs begin arriving
- A tool result lands
- The model resumes
- Final output is produced

All of that is part of the user’s experience of the agent. If you only stream text, you hide most of the system.

This is why streaming should be modeled as incremental delivery of runtime state, not just incremental delivery of assistant prose.

That has a few implications.

First, the runtime needs to decide what the canonical stream is. Are clients receiving raw provider deltas? Higher-level semantic events? A merged stream of model output plus tool lifecycle updates? Different choices produce very different product experiences.

Second, streaming has to work in the presence of real failures:

- Clients disconnect
- Mobile apps background
- Tabs refresh
- Networks stall
- Servers restart mid-stream

Once that happens, the runtime needs a coherent resume story. A client should be able to reconnect and recover the state it missed without inventing its own version of the session.

Third, streaming interacts directly with persistence. If a user saw “Generating report...” and then the server died, was that state durable or ephemeral? If a tool had already started, can the resumed client tell? If partial output was shown before a crash, is that output authoritative?

These questions are why streaming belongs in the runtime model, not just in the frontend.

A good mental model is simple: the UI is subscribing to a changing state machine. Some of those state changes are text deltas. Many are not.

**If hand-rolling:** stream semantic runtime events, not just text deltas. The same canonical events you stream here should be the events you persist and replay in the catch-up protocol in section 10, with stable ordering and resumable cursors. Treat provider token deltas as one event type among many rather than the entire protocol.

**On Cloudflare:** start with [`AIChatAgent`](https://developers.cloudflare.com/agents/api-reference/chat-agents/) or [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) plus [resumable streaming](https://developers.cloudflare.com/agents/api-reference/resumable-streaming/) and persisted messages; build a custom merged stream only if you need a more specialized transport or UI contract.

## **9\. UI is a projection of state**

Once you model the agent as a state machine, the UI gets much simpler.

The UI is just a rendering of current state plus authoritative history. It is not the system itself.

This matters because many teams accidentally design the runtime around a chat transcript. That is backwards. The transcript is one possible view. It is not the source of truth.

The current state may include:

- Pending tool calls
- In-flight execution
- Approval requests
- Partial streams
- Errors
- Artifacts
- Sandbox lifecycle
- Run status
- Retry state

A plain chat UI can represent some of this. It cannot represent all of it cleanly. Once the runtime grows up, the UI needs to be free to render whatever the state actually implies.

This is a powerful simplification.

If the UI is a function of state, then:

- Reconnect behavior gets easier to reason about
- Multiple clients can render the same session consistently
- Different surfaces can present the same underlying run differently
- Approval flows stop being hacks bolted onto a transcript
- Progress indicators become honest reflections of runtime state

This also helps with product design. You stop asking “how do we cram this into chat bubbles?” and start asking “what should a user see given the current state of the system?”

That is the right question.

The runtime should own correctness. Different UI views should render different subsets of state.

## **10\. Multi-client sync needs a catch-up protocol**

As soon as a session can outlive a single request, multi-client sync shows up. Two tabs, a mobile reconnect, an observer, a dashboard, a teammate joining later: these are all just different viewers over the same run.

The solution is not more frontend cleverness. The solution is authoritative shared state plus an explicit catch-up story.

Once you get this right, reconnect becomes catch-up, observers become straightforward, and multiple surfaces can render the same underlying reality without drifting apart.

**If hand-rolling:** use one authoritative server-side owner for session state, keep a stable ordering of semantic events, reconnect by cursor rather than by transcript, and follow a pattern like this:

1. Keep a server-authoritative event log for semantic runtime events.
2. Give each durable event a monotonic sequence number.
3. Let clients subscribe from a cursor: “give me everything after `seq=1842`.”
4. On reconnect, either deliver missed events from that cursor or send a fresh state snapshot plus events after the snapshot cursor.
5. Clients must treat locally streamed events as provisional until the server acknowledges them with a durable sequence number.

**On Cloudflare:** treat the [Durable Object](https://developers.cloudflare.com/durable-objects/) as the authoritative owner of the session. Lean on [`AIChatAgent`](https://developers.cloudflare.com/agents/api-reference/chat-agents/) or [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) for [state sync](https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/), persistence, and [resumable streaming](https://developers.cloudflare.com/agents/api-reference/resumable-streaming/) unless you specifically need a custom event protocol.

## **11\. Human control points are part of the system**

Not every action should be fully autonomous.

Some actions are cheap to repeat. Some are expensive. Some are irreversible. Some cross a trust boundary. Some are just important enough that a human should explicitly approve them.

This should be designed into the runtime.

A weak pattern is to bury approval logic in prompt text and hope the model behaves. A stronger pattern is to model approval as an explicit state:

- Pending approval
- Approved
- Rejected
- Expired

Once approval is part of the state machine, a lot of ambiguity disappears.

The runtime can:

- Block execution until approval arrives
- Render the approval request clearly in the UI
- Record who approved what
- Resume execution after approval
- Reject or expire stale requests cleanly

This also forces precision around where the actual control points are.

Typical boundaries include:

- Sending external messages
- Writing to systems of record
- Running high-risk code
- Spending money
- Touching sensitive customer data
- Triggering irreversible actions

The important point is not that every system needs lots of approvals. Many do not. The important point is that autonomy boundaries should be explicit. If a human must be in the loop, model that as part of the runtime rather than as a soft suggestion to the model.

This keeps the system honest. It also keeps product design honest. The UI can show when the agent is blocked on a person instead of pretending the run is still “thinking.”

**If hand-rolling:** put explicit approval state around the high-risk boundaries above rather than leaving them to prompt discipline.

**On Cloudflare:** use [`needsApproval`](https://developers.cloudflare.com/agents/concepts/human-in-the-loop/) for chat tool calls and [Workflow approval gates](https://developers.cloudflare.com/agents/api-reference/run-workflows/) for longer-running processes.

## **12\. Observability is how you tell what actually happened**

Once an agent does real work, transcript-level visibility stops being enough.

You need observability into the runtime itself.

At minimum, you usually want to know:

- What input the run received
- What state transitions occurred
- What tool calls were emitted
- Which tool calls actually executed
- What side effects were attempted
- What the execution environment did
- What failed
- What retried
- What the final outcome was

Without this, debugging becomes folklore. People read a few chat bubbles, infer what they think happened, and miss the actual failure mode.

A serious agent system should make it easy to answer questions like:

- Why did this run stop here?
- Why did the model choose this tool?
- Did the side effect actually happen?
- Did we retry?
- Did the client miss part of the stream?
- Which artifact was produced by which step?
- Was the system blocked on approval, execution, or the model?

This is why authoritative history matters so much. Good observability starts with durable semantic events. Logs, traces, metrics, and UI diagnostics all sit on top of that.

It is also why execution environments need visibility. If the model writes code and runs it, you need access to:

- Stdout and stderr
- Exit status
- Sandbox lifecycle
- File creation and mutation
- Resource access
- Timing

Otherwise generated code becomes a black box with a vibes-based debugging story.

A lot of teams underinvest here because observability feels secondary during prototyping. In practice, it becomes one of the first constraints once multiple people are using the system. If you cannot tell what happened, you cannot improve correctness, safety, or product quality.

**If hand-rolling:** emit semantic runtime events, not just app logs. Instrument the same events you rely on for replay, approvals, sync, and artifact tracking so you can see what the run did, what actually executed, what retried, and what state the system believed it was in.

**On Cloudflare:** [Agents observability](https://developers.cloudflare.com/agents/api-reference/observability/), [diagnostics channels](https://developers.cloudflare.com/workers/runtime-apis/nodejs/diagnostics-channel/), and [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) form the default path for this layer.

## **13\. My opinionated recommendation: use Cloudflare’s building blocks**

My default stack for early-stage agent products is [Durable Objects](https://developers.cloudflare.com/durable-objects/) + the [Agents SDK](https://developers.cloudflare.com/agents/) + [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) + [`Sessions`](https://developers.cloudflare.com/agents/api-reference/sessions/). That gives you a durable session owner, the harness plumbing, a batteries-included chat layer, and a memory model that can branch and search.

The short decision tree is simple:

- Stay on [`Think`](https://developers.cloudflare.com/agents/api-reference/think/) by default. Drop to [`AIChatAgent`](https://developers.cloudflare.com/agents/api-reference/chat-agents/) when you want direct control over the model loop, prompt assembly, tool sequencing, or provider wiring.
- Add [`Codemode`](https://developers.cloudflare.com/agents/api-reference/codemode/) plus [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) when generated code needs a lightweight isolated runtime. Add [Browser Run](https://developers.cloudflare.com/browser-run/) when the artifact is a rendered page, screenshot, or browser interaction. Add [Sandbox](https://developers.cloudflare.com/sandbox/) when the agent truly needs a Linux machine.
- Use [durable execution](https://developers.cloudflare.com/agents/api-reference/durable-execution/) when the work is still part of the agent’s own turn and you need checkpointing plus crash recovery. Use [Workflows](https://developers.cloudflare.com/agents/api-reference/run-workflows/) for durable multi-step background jobs with progress or approvals. Use [queues](https://developers.cloudflare.com/agents/api-reference/queue-tasks/) plus [retries](https://developers.cloudflare.com/agents/api-reference/retries/) for simpler asynchronous tasks.

The honest choices are still the same: use a platform that gives you this plumbing, build it yourself, or deliberately downscope so you do not need it. All three are valid. The mistake is to choose one in words and another in architecture.
