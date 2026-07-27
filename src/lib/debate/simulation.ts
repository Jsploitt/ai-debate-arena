import type { Side, StreamChunk } from "./types";

interface ScriptedDebate {
  keywords: string[];
  title: string;
  alpha: string[];
  beta: string[];
}

const SCRIPTS: ScriptedDebate[] = [
  {
    keywords: ["ethic", "safety", "regulat", "open-weight", "alignment"],
    title: "AI Ethics",
    alpha: [
      "<think>Frame the case around accountability: who is liable when a model errs? Lead with auditability.</think>Ethical AI is not a philosophy problem, it is an engineering requirement. A model whose weights, data lineage and evaluation suite can be inspected is a model an enterprise can be held accountable for. Everything else is trust by press release.",
      "<think>Counter the innovation-speed argument with measurable regulatory precedent.</think>Speed without provenance is technical debt with a legal interest rate. Aviation did not slow down when it adopted black boxes; it scaled. Auditable AI does the same: it converts unquantified risk into a line item leadership can actually sign off on.",
      "<think>Bring it to the local-inference angle relevant to this venue.</think>Note what we are doing right now: two models arguing on a single workstation, no data leaving the room. That is the strongest ethical control available today — residency by architecture, not by contract clause.",
      "<think>Close with a synthesis that still holds the line.</think>I will concede that governance can be theatre when it is written by people who have never shipped a model. The fix is not less governance, it is governance written by engineers with telemetry in front of them.",
    ],
    beta: [
      "<think>Attack the compliance-first framing as a moat for incumbents.</think>Auditability sounds noble until you price it. Every mandatory evaluation gate you add is a tax that only three companies on earth can afford to pay, and you have just handed them the entire market. That is not ethics, that is a moat with a halo.",
      "<think>Push the capability argument with concrete deployment numbers.</think>The most ethical model is the one that actually reaches the hospital, the refinery, the classroom. A perfectly documented model stuck in review for eighteen months has helped precisely nobody. Deployment velocity is a moral variable, not just a commercial one.",
      "<think>Concede the residency point but reframe it as my argument.</think>Local inference proves my case, not yours. Nobody legislated this workstation into existence — engineers shipped it because it was faster and cheaper. Capability solved the privacy problem before the committee finished its agenda.",
      "<think>Land the final blow on process versus outcomes.</think>Measure outcomes, not paperwork. If your framework cannot tell me whether a deployed system reduced harm last quarter, it is not an ethics regime — it is a filing system with excellent branding.",
    ],
  },
  {
    keywords: ["quantum", "supercomput", "hpc"],
    title: "Quantum vs Supercomputing",
    alpha: [
      "<think>Anchor on error rates and the gap between logical and physical qubits.</think>Quantum is extraordinary physics and mediocre infrastructure. Today's machines burn roughly a thousand physical qubits to stabilise one logical qubit. Meanwhile a classical exascale cluster delivers reproducible results at 3 a.m. on a Sunday without a dilution refrigerator.",
      "<think>Concede the algorithmic niche, deny the general claim.</think>Shor and Grover are real, and for factoring and unstructured search quantum wins decisively. But the enterprise workload mix is linear algebra, simulation and inference — and every one of those runs faster today on GPUs than on any quantum device in existence.",
      "<think>Bring in the practical Saudi infrastructure angle.</think>If you are building compute capacity for a national programme this decade, you procure GPU clusters and classical HPC. You fund quantum research in parallel, deliberately, as a hedge — not as your production substrate.",
      "<think>Close on the hybrid future.</think>The endgame is hybrid: classical orchestration with quantum accelerators for narrow kernels. That is not quantum replacing supercomputing, that is quantum becoming a peripheral of it.",
    ],
    beta: [
      "<think>Reframe the timeline: exponential scaling curves beat linear intuition.</think>You are benchmarking a 1950s transistor and concluding computers will never matter. Logical qubit counts are compounding, error-corrected demonstrations landed years ahead of consensus forecasts, and classical scaling is fighting thermodynamics for every additional watt.",
      "<think>Attack the workload-mix argument at its root.</think>The workload mix is a consequence of what hardware exists. Chemistry, materials and portfolio optimisation are under-attempted precisely because classical simulation makes them unaffordable. New substrate, new workloads — that is how every compute revolution has gone.",
      "<think>Turn the national-infrastructure point around.</think>Nations that wait for maturity buy someone else's roadmap. The strategic move is to build quantum talent and access now, while the field is still shapeable, not to rent it in 2035 at monopoly pricing.",
      "<think>Accept hybrid but claim the centre of gravity.</think>I accept hybrid. I simply disagree about which component is the peripheral. Within a decade the classical cluster is the I/O layer, and the interesting physics is happening in the cold.",
    ],
  },
  {
    keywords: ["smart cit", "the line", "neom", "urban", "vision 2030"],
    title: "Saudi Smart Cities Infrastructure",
    alpha: [
      "<think>Lead with latency budgets and sovereignty for a greenfield city.</think>A city like THE LINE runs on control loops measured in milliseconds — transit, energy, water, safety. You cannot arbitrate those decisions across a regional cloud round trip. Compute belongs inside the city fabric, distributed across thousands of edge nodes.",
      "<think>Address the operational cost objection.</think>Yes, distributed hardware costs more per node. It also costs less per outage. A centralised architecture converts a single fibre cut into a citywide incident; a mesh of local inference nodes degrades gracefully and keeps the trains moving.",
      "<think>Tie to sovereignty and Vision 2030.</think>Sovereign data residency is not a checkbox here, it is the premise. Citizen telemetry processed on national infrastructure, by models running on national hardware, is exactly the capability Vision 2030 is building toward.",
      "<think>Close by conceding the coordination layer.</think>Cloud still owns training, long-horizon analytics and fleet orchestration. But the reflexes of the city — the parts that must never pause — live at the edge.",
    ],
    beta: [
      "<think>Attack the operational complexity of thousands of edge sites.</think>You have just described ten thousand small data centres with no operations team. Every one needs patching, physical security, thermal management and a hardware refresh cycle. Distributed systems fail in distributed ways, usually at scale and usually at night.",
      "<think>Push centralised efficiency and model quality.</think>Centralised infrastructure gives you fleet-wide model updates in one deployment, far better GPU utilisation, and the ability to run frontier-scale models instead of whatever fits in a streetside enclosure. A smarter city beats a marginally faster dumb one.",
      "<think>Grant sovereignty, deny that it implies edge.</think>Sovereignty is about jurisdiction, not distance. A national data centre inside the Kingdom satisfies every residency requirement while remaining operable by a team you can actually staff and certify.",
      "<think>Final position: tiered, with the weight in the middle.</think>Put reflexes in the device, intelligence in the regional core. Anything in between is an architecture diagram that looks impressive and pages someone every weekend.",
    ],
  },
];

const GENERIC_ALPHA = [
  "<think>Open by defining the terms so the resolution cannot be argued past.</think>Let me define the resolution before we argue past each other: {topic}. My position is affirmative, and the case rests on three measurable claims — cost, reliability and time to value. Each is testable, which is more than rhetoric usually offers.",
  "<think>Reinforce with evidence and pre-empt the obvious rebuttal.</think>The strongest evidence is operational. Organisations that committed early to this direction report lower incident rates and shorter deployment cycles. The standard objection — that this only works at small scale — confuses an early adoption curve with a ceiling.",
  "<think>Concede a narrow point to gain credibility, then press.</think>I will grant that the transition cost is real and frequently understated. But a one-time migration cost amortised over a decade is not an argument against the destination; it is an argument for planning the route properly.",
  "<think>Close with the strategic framing.</think>Strategically the question is not whether this becomes standard, but whether you adopt it while it is still a differentiator or after it becomes table stakes. On {topic}, the affirmative case is simply the earlier one.",
];

const GENERIC_BETA = [
  "<think>Reject the framing before engaging the substance.</think>The definition is doing an enormous amount of work there. On {topic}, the negative case begins by noting that your three metrics were chosen because they flatter your conclusion. Change the measurement window and the advantage inverts.",
  "<think>Attack the evidence base as selection bias.</think>Your operational evidence is survivorship in a lab coat. We hear from the organisations where this worked; the ones that quietly rolled back do not publish case studies. That is not data, that is a marketing funnel with footnotes.",
  "<think>Accept the concession and widen it.</think>You concede transition cost, so let us price it honestly: retraining, tooling, and the eighteen months where your team is fluent in neither the old system nor the new one. That gap is where most of these programmes actually die.",
  "<think>Close by offering the pragmatic alternative.</think>My position is not stagnation, it is sequencing. Adopt where the payoff is provable, hold where it is not, and stop treating a procurement decision as an identity. On {topic}, the negative case is simply the disciplined one.",
];

function pickScript(topic: string) {
  const lower = topic.toLowerCase();
  return SCRIPTS.find((s) => s.keywords.some((k) => lower.includes(k)));
}

export function simulatedTurnText(topic: string, side: Side, turn: number): string {
  const script = pickScript(topic);
  const pool = script
    ? side === "alpha"
      ? script.alpha
      : script.beta
    : side === "alpha"
      ? GENERIC_ALPHA
      : GENERIC_BETA;
  const text = pool[turn % pool.length];
  return text.replaceAll("{topic}", topic.replace(/\.$/, ""));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* simulateStream(
  text: string,
  model: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const pieces = text.match(/\S+\s*/g) ?? [text];
  await sleep(280 + Math.random() * 420);
  let evalCount = 0;
  for (const piece of pieces) {
    if (signal?.aborted) return;
    evalCount += 1;
    await sleep(18 + Math.random() * 45);
    yield {
      content: piece,
      done: false,
      raw: JSON.stringify({
        model,
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: piece },
        done: false,
      }),
    };
  }
  yield {
    content: "",
    done: true,
    evalCount,
    promptEvalCount: 180 + Math.floor(Math.random() * 400),
    raw: JSON.stringify({
      model,
      done: true,
      done_reason: "stop",
      eval_count: evalCount,
      eval_duration: evalCount * 24_000_000,
    }),
  };
}
