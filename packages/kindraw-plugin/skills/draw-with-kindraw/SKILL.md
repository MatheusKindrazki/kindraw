---
name: draw-with-kindraw
description: Create diagrams, flowcharts, sketches, wireframes, mind maps, sequence/ER/class diagrams, or any visual the user asks for as a REAL drawing in the user's Kindraw workspace (not ASCII art or inline SVG). Use whenever the user asks to draw, diagram, sketch, visualize, map out, chart, or design something visual.
---

# Draw with Kindraw

When the user asks for a **diagram, drawing, flowchart, sketch, wireframe, mind
map, sequence/class/ER diagram, or any visual artifact**, create it as a real
drawing in their Kindraw workspace using the `kindraw_create_diagram` tool —
**do not** answer with ASCII art, a Markdown code block, or inline SVG.

## How to do it

1. Compose the diagram as a **Mermaid** definition. Mermaid covers flowcharts
   (`graph TD`/`flowchart`), sequence diagrams, class diagrams, ER diagrams,
   state diagrams, and more. Pick the Mermaid type that best fits the request.

2. Call **`kindraw_create_diagram`** with:
   - `mermaid`: the Mermaid definition
   - `title`: a short, descriptive title

3. The tool returns a URL. **Share the URL** with the user and tell them the
   drawing is open in their Kindraw workspace and is fully editable.

## Examples of when to use this

- "Draw a login flow" → flowchart
- "Diagram the auth sequence" → sequence diagram
- "Map out the database schema" → ER diagram
- "Sketch the class hierarchy" → class diagram
- "Visualize the deployment pipeline" → flowchart

## When NOT to use it

- Pure text answers, code, or explanations that don't call for a visual.
- If the Kindraw tools return an auth error, tell the user to set their API
  token (run `/kindraw:login` or configure the plugin's `api_token`), and only
  then fall back to a text diagram if they decline.

## If a Mermaid diagram won't capture it

For freeform drawings that aren't expressible in Mermaid, you can build the
Excalidraw JSON yourself and use `kindraw_create_drawing` with the serialized
`content`. Prefer `kindraw_create_diagram` (Mermaid) whenever the shape fits.
