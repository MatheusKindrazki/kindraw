import type { Env } from "./types";

// A single entry accepted by the public `convertToExcalidrawElements` API.
// We keep this loose on purpose: the client owns the canonical skeleton type,
// and these curated objects only need to be a valid subset of it.
type TemplateSkeletonElement = Record<string, unknown>;

type KindrawTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  elements: TemplateSkeletonElement[];
};

// Curated content can be revised; keep caches short with revalidation so
// updated templates propagate quickly instead of being pinned for an hour.
const LIST_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
const ITEM_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

const errorResponse = (status: number, message: string) =>
  jsonResponse(
    {
      error: message,
      status,
    },
    { status },
  );

const TEMPLATES: KindrawTemplate[] = [
  {
    id: "login-flow",
    title: "Login Flow",
    description:
      "Credential entry with validation, a retry loop, password recovery and a locked-account branch.",
    category: "Flowchart",
    elements: [
      // Vertical happy-path centered on x = 300 (shape center). A recovery
      // branch sits to the right (x = 640) and an error/lock branch to the left.
      {
        type: "ellipse",
        id: "login-start",
        x: 220,
        y: 0,
        width: 160,
        height: 70,
        backgroundColor: "#a5d8ff",
        label: { text: "Start" },
      },
      {
        type: "rectangle",
        id: "login-credentials",
        x: 200,
        y: 160,
        width: 200,
        height: 80,
        backgroundColor: "#e7f5ff",
        label: { text: "Enter credentials" },
      },
      {
        type: "diamond",
        id: "login-valid",
        x: 200,
        y: 330,
        width: 200,
        height: 120,
        backgroundColor: "#ffec99",
        label: { text: "Valid?" },
      },
      {
        type: "diamond",
        id: "login-attempts",
        x: 200,
        y: 560,
        width: 200,
        height: 120,
        backgroundColor: "#ffe8cc",
        label: { text: "Attempts < 3?" },
      },
      {
        type: "rectangle",
        id: "login-dashboard",
        x: 200,
        y: 800,
        width: 200,
        height: 80,
        backgroundColor: "#b2f2bb",
        label: { text: "Dashboard" },
      },
      // Recovery branch (right column, x center = 740).
      {
        type: "rectangle",
        id: "login-forgot",
        x: 640,
        y: 175,
        width: 200,
        height: 80,
        backgroundColor: "#d0bfff",
        label: { text: "Forgot password" },
      },
      {
        type: "rectangle",
        id: "login-reset",
        x: 640,
        y: 330,
        width: 200,
        height: 80,
        backgroundColor: "#eebefa",
        label: { text: "Send reset email" },
      },
      // Lock branch (left, x center = -40).
      {
        type: "rectangle",
        id: "login-locked",
        x: -140,
        y: 580,
        width: 200,
        height: 80,
        backgroundColor: "#ffc9c9",
        label: { text: "Lock account" },
      },
      // Connectors use explicit absolute geometry (x/y + relative points) and
      // are intentionally UNBOUND (see file note): the insertion path commits
      // converted elements via updateScene without a binding re-route, so a
      // bound arrow would render its raw points only.
      // Start bottom (y=70) -> credentials top (y=160), centered on x=300.
      {
        type: "arrow",
        x: 300,
        y: 70,
        points: [
          [0, 0],
          [0, 90],
        ],
      },
      // Credentials bottom (y=240) -> Valid? top (y=330).
      {
        type: "arrow",
        x: 300,
        y: 240,
        points: [
          [0, 0],
          [0, 90],
        ],
      },
      // Valid? bottom (y=450) -> Dashboard... actually goes to Attempts check on
      // failure; the "Yes" path skips straight to Dashboard via the right inner
      // rail. Valid? bottom (y=450) -> Attempts top (y=560), labeled "No".
      {
        type: "arrow",
        x: 300,
        y: 450,
        points: [
          [0, 0],
          [0, 110],
        ],
        label: { text: "No" },
      },
      // Valid? "Yes": right edge (x=400,y=390) down the inner rail to Dashboard
      // top (x=300,y=800).
      {
        type: "arrow",
        x: 400,
        y: 390,
        points: [
          [60, 0],
          [60, 410],
          [-100, 410],
        ],
        label: { text: "Yes" },
      },
      // Attempts "Yes" (retry): left edge (x=200,y=620) loops back up to the
      // credentials left edge (x=200,y=200).
      {
        type: "arrow",
        x: 200,
        y: 620,
        points: [
          [0, 0],
          [-80, 0],
          [-80, -420],
          [0, -420],
        ],
        label: { text: "retry" },
      },
      // Attempts "No": bottom of attempts is occupied; route from left edge
      // (x=200,y=650) further left to Lock account right edge (x=60,y=620).
      {
        type: "arrow",
        x: 200,
        y: 655,
        points: [
          [0, 0],
          [-140, -35],
        ],
        label: { text: "No" },
      },
      // Credentials right (x=400,y=200) -> Forgot password left (x=640,y=215).
      {
        type: "arrow",
        x: 400,
        y: 200,
        points: [
          [0, 0],
          [240, 15],
        ],
        label: { text: "link" },
      },
      // Forgot password bottom (x=740,y=255) -> Send reset email top (y=330).
      {
        type: "arrow",
        x: 740,
        y: 255,
        points: [
          [0, 0],
          [0, 75],
        ],
      },
      // Send reset email left (x=640,y=370) -> back to credentials right
      // (x=400,y=200).
      {
        type: "arrow",
        x: 640,
        y: 370,
        points: [
          [0, 0],
          [-120, 0],
          [-120, -170],
          [-120, -170],
        ],
        startArrowhead: null,
        endArrowhead: "arrow",
      },
    ],
  },
  {
    id: "client-server",
    title: "Client / Server",
    description: "Client talks to an API server which reads from a database.",
    category: "Architecture",
    elements: [
      // Horizontal flow centered on y = 60 (shape center).
      {
        type: "rectangle",
        id: "cs-client",
        x: 0,
        y: 20,
        width: 180,
        height: 100,
        backgroundColor: "#a5d8ff",
        label: { text: "Client" },
      },
      {
        type: "rectangle",
        id: "cs-api",
        x: 300,
        y: 20,
        width: 180,
        height: 100,
        backgroundColor: "#d0bfff",
        label: { text: "API Server" },
      },
      {
        type: "rectangle",
        id: "cs-db",
        x: 600,
        y: 20,
        width: 180,
        height: 100,
        backgroundColor: "#b2f2bb",
        label: { text: "Database" },
      },
      {
        type: "arrow",
        x: 180,
        y: 70,
        points: [
          [0, 0],
          [120, 0],
        ],
      },
      {
        type: "arrow",
        x: 480,
        y: 70,
        points: [
          [0, 0],
          [120, 0],
        ],
      },
    ],
  },
  {
    id: "simple-flowchart",
    title: "Simple Flowchart",
    description: "A generic start, process, decision and end vertical flow.",
    category: "Flowchart",
    elements: [
      // Vertical flow centered on x = 300 (shape center).
      {
        type: "ellipse",
        id: "sf-start",
        x: 220,
        y: 0,
        width: 160,
        height: 70,
        backgroundColor: "#a5d8ff",
        label: { text: "Start" },
      },
      {
        type: "rectangle",
        id: "sf-process",
        x: 200,
        y: 160,
        width: 200,
        height: 80,
        backgroundColor: "#e7f5ff",
        label: { text: "Process" },
      },
      {
        type: "diamond",
        id: "sf-decision",
        x: 200,
        y: 330,
        width: 200,
        height: 120,
        backgroundColor: "#ffec99",
        label: { text: "Decision" },
      },
      {
        type: "ellipse",
        id: "sf-end",
        x: 220,
        y: 540,
        width: 160,
        height: 70,
        backgroundColor: "#b2f2bb",
        label: { text: "End" },
      },
      {
        type: "arrow",
        x: 300,
        y: 70,
        points: [
          [0, 0],
          [0, 90],
        ],
      },
      {
        type: "arrow",
        x: 300,
        y: 240,
        points: [
          [0, 0],
          [0, 90],
        ],
      },
      {
        type: "arrow",
        x: 300,
        y: 450,
        points: [
          [0, 0],
          [0, 90],
        ],
      },
    ],
  },
  {
    id: "swimlane",
    title: "Swimlane",
    description:
      "Two responsibility lanes with task cards arranged side by side.",
    category: "Planning",
    elements: [
      // Lanes: 280 wide, 60px top band reserved for the header label.
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 280,
        height: 400,
        backgroundColor: "#e7f5ff",
        label: { text: "Design", verticalAlign: "top" },
      },
      {
        type: "rectangle",
        x: 320,
        y: 0,
        width: 280,
        height: 400,
        backgroundColor: "#fff0f6",
        label: { text: "Development", verticalAlign: "top" },
      },
      // Cards inset 30px from lane sides, starting below the header band.
      {
        type: "rectangle",
        x: 30,
        y: 90,
        width: 220,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Wireframes" },
      },
      {
        type: "rectangle",
        x: 30,
        y: 190,
        width: 220,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Mockups" },
      },
      {
        type: "rectangle",
        x: 350,
        y: 90,
        width: 220,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "API" },
      },
      {
        type: "rectangle",
        x: 350,
        y: 190,
        width: 220,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "UI" },
      },
    ],
  },
  {
    id: "mindmap",
    title: "Mind Map",
    description: "A central idea with four branching topics around it.",
    category: "Brainstorm",
    elements: [
      // Symmetric radial layout. Center shape spans x[260..440], y[230..330];
      // center point = (350, 280). Topics are placed symmetrically around it.
      {
        type: "ellipse",
        id: "mm-center",
        x: 260,
        y: 230,
        width: 180,
        height: 100,
        backgroundColor: "#d0bfff",
        label: { text: "Idea" },
      },
      {
        type: "ellipse",
        id: "mm-top",
        x: 280,
        y: 0,
        width: 140,
        height: 80,
        backgroundColor: "#a5d8ff",
        label: { text: "Topic A" },
      },
      {
        type: "ellipse",
        id: "mm-right",
        x: 560,
        y: 240,
        width: 140,
        height: 80,
        backgroundColor: "#b2f2bb",
        label: { text: "Topic B" },
      },
      {
        type: "ellipse",
        id: "mm-bottom",
        x: 280,
        y: 480,
        width: 140,
        height: 80,
        backgroundColor: "#ffec99",
        label: { text: "Topic C" },
      },
      {
        type: "ellipse",
        id: "mm-left",
        x: 0,
        y: 240,
        width: 140,
        height: 80,
        backgroundColor: "#ffc9c9",
        label: { text: "Topic D" },
      },
      // Connectors radiate from the center with explicit absolute geometry,
      // unbound (see login-flow note), arrowheads disabled so they read as
      // plain mind-map branches. Center point = (350, 280).
      // Center top (350,230) -> Topic A bottom (350,80).
      {
        type: "arrow",
        x: 350,
        y: 230,
        points: [
          [0, 0],
          [0, -150],
        ],
        startArrowhead: null,
        endArrowhead: null,
      },
      // Center right (440,280) -> Topic B left (560,280).
      {
        type: "arrow",
        x: 440,
        y: 280,
        points: [
          [0, 0],
          [120, 0],
        ],
        startArrowhead: null,
        endArrowhead: null,
      },
      // Center bottom (350,330) -> Topic C top (350,480).
      {
        type: "arrow",
        x: 350,
        y: 330,
        points: [
          [0, 0],
          [0, 150],
        ],
        startArrowhead: null,
        endArrowhead: null,
      },
      // Center left (260,280) -> Topic D right (140,280).
      {
        type: "arrow",
        x: 260,
        y: 280,
        points: [
          [0, 0],
          [-120, 0],
        ],
        startArrowhead: null,
        endArrowhead: null,
      },
    ],
  },
  {
    id: "kanban",
    title: "Kanban Board",
    description:
      "Backlog, To Do, In Progress and Done lanes with colour-coded task cards.",
    category: "Planning",
    elements: [
      // Four columns: 240 wide, 40px gutter, 60px top band for the header label.
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 240,
        height: 560,
        backgroundColor: "#f1f3f5",
        label: { text: "Backlog", verticalAlign: "top" },
      },
      {
        type: "rectangle",
        x: 280,
        y: 0,
        width: 240,
        height: 560,
        backgroundColor: "#e7f5ff",
        label: { text: "To Do", verticalAlign: "top" },
      },
      {
        type: "rectangle",
        x: 560,
        y: 0,
        width: 240,
        height: 560,
        backgroundColor: "#fff9db",
        label: { text: "In Progress", verticalAlign: "top" },
      },
      {
        type: "rectangle",
        x: 840,
        y: 0,
        width: 240,
        height: 560,
        backgroundColor: "#ebfbee",
        label: { text: "Done", verticalAlign: "top" },
      },
      // Cards inset 25px from column sides, below the header band. Left stroke
      // accent is conveyed by the card background tint (priority colour).
      // Backlog
      {
        type: "rectangle",
        x: 25,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Research spike" },
      },
      {
        type: "rectangle",
        x: 25,
        y: 180,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Design review" },
      },
      // To Do
      {
        type: "rectangle",
        x: 305,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#fff3bf",
        label: { text: "Build API endpoint" },
      },
      {
        type: "rectangle",
        x: 305,
        y: 180,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Write tests" },
      },
      {
        type: "rectangle",
        x: 305,
        y: 270,
        width: 190,
        height: 70,
        backgroundColor: "#ffec99",
        label: { text: "Wire up auth" },
      },
      // In Progress
      {
        type: "rectangle",
        x: 585,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#d3f9d8",
        label: { text: "Sidebar tabs" },
      },
      {
        type: "rectangle",
        x: 585,
        y: 180,
        width: 190,
        height: 70,
        backgroundColor: "#ffc9c9",
        label: { text: "Fix flaky test" },
      },
      // Done
      {
        type: "rectangle",
        x: 865,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Project setup" },
      },
      {
        type: "rectangle",
        x: 865,
        y: 180,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "CI pipeline" },
      },
    ],
  },
  {
    id: "retrospective",
    title: "Retrospective",
    description:
      "Start, Stop, Continue post-it board for a team retro, with sample sticky notes.",
    category: "Post-it",
    elements: [
      // Three columns of sticky notes. Column headers are plain text; notes are
      // small square-ish rectangles with handdrawn labels for a sticky feel.
      // Column x-centers: Start=120, Stop=420, Continue=720.
      {
        type: "rectangle",
        x: 20,
        y: 0,
        width: 200,
        height: 56,
        backgroundColor: "#b2f2bb",
        label: { text: "Start", fontFamily: 5 },
      },
      {
        type: "rectangle",
        x: 320,
        y: 0,
        width: 200,
        height: 56,
        backgroundColor: "#ffc9c9",
        label: { text: "Stop", fontFamily: 5 },
      },
      {
        type: "rectangle",
        x: 620,
        y: 0,
        width: 200,
        height: 56,
        backgroundColor: "#a5d8ff",
        label: { text: "Continue", fontFamily: 5 },
      },
      // Start notes (greenish).
      {
        type: "rectangle",
        x: 30,
        y: 90,
        width: 180,
        height: 120,
        backgroundColor: "#d8f5a2",
        label: { text: "Pair on tricky tickets", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 30,
        y: 240,
        width: 180,
        height: 120,
        backgroundColor: "#d8f5a2",
        label: { text: "Demo every Friday", fontFamily: 5, fontSize: 16 },
      },
      // Stop notes (reddish).
      {
        type: "rectangle",
        x: 330,
        y: 90,
        width: 180,
        height: 120,
        backgroundColor: "#ffd8a8",
        label: { text: "Last-minute scope", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 330,
        y: 240,
        width: 180,
        height: 120,
        backgroundColor: "#ffd8a8",
        label: { text: "Meetings with no agenda", fontFamily: 5, fontSize: 16 },
      },
      // Continue notes (blueish).
      {
        type: "rectangle",
        x: 630,
        y: 90,
        width: 180,
        height: 120,
        backgroundColor: "#d0ebff",
        label: { text: "Async standups", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 630,
        y: 240,
        width: 180,
        height: 120,
        backgroundColor: "#d0ebff",
        label: { text: "Clear PR descriptions", fontFamily: 5, fontSize: 16 },
      },
    ],
  },
  {
    id: "brainstorm-grid",
    title: "Brainstorm Wall",
    description:
      "A grid of colourful post-it notes for ideation — drop your ideas in.",
    category: "Post-it",
    elements: [
      // 4x2 grid of sticky notes, 180x140 with a 30px gutter. Rotated slightly
      // is not supported in skeletons reliably, so we keep them upright but vary
      // the colours for a lively wall.
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 180,
        height: 140,
        backgroundColor: "#fff3bf",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 210,
        y: 0,
        width: 180,
        height: 140,
        backgroundColor: "#ffd8a8",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 420,
        y: 0,
        width: 180,
        height: 140,
        backgroundColor: "#d8f5a2",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 630,
        y: 0,
        width: 180,
        height: 140,
        backgroundColor: "#d0ebff",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 0,
        y: 170,
        width: 180,
        height: 140,
        backgroundColor: "#eebefa",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 210,
        y: 170,
        width: 180,
        height: 140,
        backgroundColor: "#ffc9c9",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 420,
        y: 170,
        width: 180,
        height: 140,
        backgroundColor: "#c3fae8",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 630,
        y: 170,
        width: 180,
        height: 140,
        backgroundColor: "#bac8ff",
        label: { text: "Idea", fontFamily: 5, fontSize: 16 },
      },
    ],
  },
  {
    id: "priority-matrix",
    title: "Priority Matrix",
    description:
      "Impact vs effort 2x2 with post-it notes in each quadrant (do, plan, quick wins, drop).",
    category: "Post-it",
    elements: [
      // Four quadrants, 360x300 each, sharing center lines at x=360, y=300.
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 360,
        height: 300,
        backgroundColor: "#ebfbee",
        label: { text: "Quick wins", verticalAlign: "top", fontFamily: 5 },
      },
      {
        type: "rectangle",
        x: 360,
        y: 0,
        width: 360,
        height: 300,
        backgroundColor: "#e7f5ff",
        label: { text: "Major projects", verticalAlign: "top", fontFamily: 5 },
      },
      {
        type: "rectangle",
        x: 0,
        y: 300,
        width: 360,
        height: 300,
        backgroundColor: "#fff9db",
        label: { text: "Fill-ins", verticalAlign: "top", fontFamily: 5 },
      },
      {
        type: "rectangle",
        x: 360,
        y: 300,
        width: 360,
        height: 300,
        backgroundColor: "#fff0f6",
        label: { text: "Thankless tasks", verticalAlign: "top", fontFamily: 5 },
      },
      // A couple of sample notes.
      {
        type: "rectangle",
        x: 60,
        y: 110,
        width: 150,
        height: 110,
        backgroundColor: "#d8f5a2",
        label: { text: "Tooltip copy", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 420,
        y: 110,
        width: 150,
        height: 110,
        backgroundColor: "#a5d8ff",
        label: { text: "New onboarding", fontFamily: 5, fontSize: 16 },
      },
    ],
  },
  {
    id: "user-journey",
    title: "User Journey",
    description:
      "Five-stage journey map with action and emotion rows for each phase.",
    category: "Planning",
    elements: [
      // Stage headers across the top, 200 wide with 20px gutters.
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 200,
        height: 60,
        backgroundColor: "#d0bfff",
        label: { text: "Discover" },
      },
      {
        type: "rectangle",
        x: 220,
        y: 0,
        width: 200,
        height: 60,
        backgroundColor: "#bac8ff",
        label: { text: "Sign up" },
      },
      {
        type: "rectangle",
        x: 440,
        y: 0,
        width: 200,
        height: 60,
        backgroundColor: "#a5d8ff",
        label: { text: "First use" },
      },
      {
        type: "rectangle",
        x: 660,
        y: 0,
        width: 200,
        height: 60,
        backgroundColor: "#99e9f2",
        label: { text: "Habit" },
      },
      {
        type: "rectangle",
        x: 880,
        y: 0,
        width: 200,
        height: 60,
        backgroundColor: "#96f2d7",
        label: { text: "Advocate" },
      },
      // Action row.
      {
        type: "rectangle",
        x: 0,
        y: 90,
        width: 200,
        height: 90,
        backgroundColor: "#f8f9fa",
        label: { text: "Find via search", fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 220,
        y: 90,
        width: 200,
        height: 90,
        backgroundColor: "#f8f9fa",
        label: { text: "Create account", fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 440,
        y: 90,
        width: 200,
        height: 90,
        backgroundColor: "#f8f9fa",
        label: { text: "Draw first canvas", fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 660,
        y: 90,
        width: 200,
        height: 90,
        backgroundColor: "#f8f9fa",
        label: { text: "Daily diagrams", fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 880,
        y: 90,
        width: 200,
        height: 90,
        backgroundColor: "#f8f9fa",
        label: { text: "Share & invite", fontSize: 16 },
      },
      // Emotion row (post-it style faces via text).
      {
        type: "rectangle",
        x: 0,
        y: 200,
        width: 200,
        height: 70,
        backgroundColor: "#ffec99",
        label: { text: "curious", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 220,
        y: 200,
        width: 200,
        height: 70,
        backgroundColor: "#ffd8a8",
        label: { text: "hesitant", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 440,
        y: 200,
        width: 200,
        height: 70,
        backgroundColor: "#b2f2bb",
        label: { text: "delighted", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 660,
        y: 200,
        width: 200,
        height: 70,
        backgroundColor: "#a5d8ff",
        label: { text: "confident", fontFamily: 5, fontSize: 16 },
      },
      {
        type: "rectangle",
        x: 880,
        y: 200,
        width: 200,
        height: 70,
        backgroundColor: "#96f2d7",
        label: { text: "proud", fontFamily: 5, fontSize: 16 },
      },
    ],
  },
  {
    id: "org-chart",
    title: "Org Chart",
    description: "A three-level organisation chart with a CEO, leads and reports.",
    category: "Architecture",
    elements: [
      // Level 1 (x center = 400).
      {
        type: "rectangle",
        id: "org-ceo",
        x: 320,
        y: 0,
        width: 160,
        height: 70,
        backgroundColor: "#d0bfff",
        label: { text: "CEO" },
      },
      // Level 2 (x centers = 200 and 600).
      {
        type: "rectangle",
        id: "org-eng",
        x: 120,
        y: 180,
        width: 160,
        height: 70,
        backgroundColor: "#a5d8ff",
        label: { text: "Eng Lead" },
      },
      {
        type: "rectangle",
        id: "org-design",
        x: 520,
        y: 180,
        width: 160,
        height: 70,
        backgroundColor: "#a5d8ff",
        label: { text: "Design Lead" },
      },
      // Level 3 (reports).
      {
        type: "rectangle",
        x: 20,
        y: 360,
        width: 160,
        height: 70,
        backgroundColor: "#b2f2bb",
        label: { text: "Backend" },
      },
      {
        type: "rectangle",
        x: 220,
        y: 360,
        width: 160,
        height: 70,
        backgroundColor: "#b2f2bb",
        label: { text: "Frontend" },
      },
      {
        type: "rectangle",
        x: 520,
        y: 360,
        width: 160,
        height: 70,
        backgroundColor: "#b2f2bb",
        label: { text: "Product" },
      },
      // Connectors, unbound with explicit geometry. CEO bottom (400,70).
      {
        type: "arrow",
        x: 400,
        y: 70,
        points: [
          [0, 0],
          [0, 55],
          [-200, 55],
          [-200, 110],
        ],
        endArrowhead: "arrow",
      },
      {
        type: "arrow",
        x: 400,
        y: 70,
        points: [
          [0, 0],
          [0, 55],
          [200, 55],
          [200, 110],
        ],
        endArrowhead: "arrow",
      },
      // Eng Lead bottom (200,250) -> Backend & Frontend.
      {
        type: "arrow",
        x: 200,
        y: 250,
        points: [
          [0, 0],
          [0, 55],
          [-100, 55],
          [-100, 110],
        ],
        endArrowhead: "arrow",
      },
      {
        type: "arrow",
        x: 200,
        y: 250,
        points: [
          [0, 0],
          [0, 55],
          [100, 55],
          [100, 110],
        ],
        endArrowhead: "arrow",
      },
      // Design Lead bottom (600,250) -> Product (x center 600).
      {
        type: "arrow",
        x: 600,
        y: 250,
        points: [
          [0, 0],
          [0, 110],
        ],
        endArrowhead: "arrow",
      },
    ],
  },
];

export const handleTemplateList = async (
  _request: Request,
  _env: Env,
): Promise<Response> => {
  const templates = TEMPLATES.map(({ id, title, description, category }) => ({
    id,
    title,
    description,
    category,
  }));

  return jsonResponse(
    { templates },
    { headers: { "Cache-Control": LIST_CACHE_CONTROL } },
  );
};

export const handleTemplateById = async (
  _request: Request,
  _env: Env,
  id: string,
): Promise<Response> => {
  const template = TEMPLATES.find((entry) => entry.id === id);

  if (!template) {
    return errorResponse(404, "Template not found.");
  }

  return jsonResponse(template, {
    headers: { "Cache-Control": ITEM_CACHE_CONTROL },
  });
};
