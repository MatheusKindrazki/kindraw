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
    description: "Credential entry with a validation branch back to the form.",
    category: "Flowchart",
    elements: [
      // Vertical flow centered on x = 300 (shape center).
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
        type: "rectangle",
        id: "login-dashboard",
        x: 200,
        y: 540,
        width: 200,
        height: 80,
        backgroundColor: "#b2f2bb",
        label: { text: "Dashboard" },
      },
      // Connectors use explicit absolute geometry (x/y + relative points) and
      // are intentionally UNBOUND. The insertion path inserts converted
      // elements via updateScene without a binding re-route, so a bound arrow
      // would render its raw points only — explicit points render predictably
      // and visibly span each shape edge-to-edge.
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
      // Valid? bottom (y=450) -> Dashboard top (y=540), labeled "Yes".
      {
        type: "arrow",
        x: 300,
        y: 450,
        points: [
          [0, 0],
          [0, 90],
        ],
        label: { text: "Yes" },
      },
      // "No" loop: Valid? right edge (x=400, y=390) routes out, up and back to
      // the credentials right edge (x=400, y=200).
      {
        type: "arrow",
        x: 400,
        y: 390,
        points: [
          [0, 0],
          [70, 0],
          [70, -190],
          [0, -190],
        ],
        label: { text: "No" },
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
    description: "To Do, In Progress and Done columns with sample cards.",
    category: "Planning",
    elements: [
      // Columns: 240 wide, 40px gutter, 60px top band for the header label.
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 240,
        height: 420,
        backgroundColor: "#e7f5ff",
        label: { text: "To Do", verticalAlign: "top" },
      },
      {
        type: "rectangle",
        x: 280,
        y: 0,
        width: 240,
        height: 420,
        backgroundColor: "#fff9db",
        label: { text: "In Progress", verticalAlign: "top" },
      },
      {
        type: "rectangle",
        x: 560,
        y: 0,
        width: 240,
        height: 420,
        backgroundColor: "#ebfbee",
        label: { text: "Done", verticalAlign: "top" },
      },
      // Cards inset 25px from column sides, below the header band.
      {
        type: "rectangle",
        x: 25,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Task 1" },
      },
      {
        type: "rectangle",
        x: 25,
        y: 190,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Task 2" },
      },
      {
        type: "rectangle",
        x: 305,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Task 3" },
      },
      {
        type: "rectangle",
        x: 585,
        y: 90,
        width: 190,
        height: 70,
        backgroundColor: "#ffffff",
        label: { text: "Task 4" },
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
