# Architecture diagrams

The English [interactive page](index.html) and [SVG overview](overview.svg) serve the English README. The Chinese [interactive page](zh-CN/index.html) and [SVG overview](zh-CN/overview.svg) serve the Chinese README. The Chinese page retains the detailed Agent, tool, Skill, prompt-structure, and result-file drilldowns from the reviewed design.

## Regenerate

From the repository root:

```sh
node docs/architecture/build.mjs
npm run docs:check
```

The root generator builds both editions. Its node definitions produce the English page and SVG. The Chinese generator reads `zh-CN/architecture-contract.json`, `zh-CN/detail-client.js`, and `zh-CN/detail-style.css` to produce its page, SVG, and Mermaid overview. Each edition shares its graph data between static and interactive output. Update both editions when runtime behavior changes. [Runtime architecture](../architecture-overview.md) owns system boundaries; the diagram presents those boundaries and example task structures.

## Version control and access

Commit the generators, contract, client, styles, and generated HTML, SVG, and Mermaid together. The generated SVG renders directly in GitHub READMEs. GitHub file links show HTML source; download an interactive HTML file and open it in a browser to use its controls. Each HTML file embeds its diagram, styles, data, and scripts.

For a public interactive URL, publish this directory through a static host such as GitHub Pages. Preserve the directory structure so the language links and downloads keep their relative paths. A deployment that serves the full `docs/` directory also retains links to the owning technical documents. Public hosting follows the repository's publishing configuration; local preview addresses serve the current machine.
