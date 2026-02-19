# **Feature Core Logic Component**

**Status**: To be done

**Title:** Core logic library

**Description:** 
To distribute a pure client-side web app to AI agents and other applications, we must decouple the business logic (the Drive API wrapper and split-bill operations) from the DOM/UI layer.

The most effective approach is to extract Quozen's core logic into an isomorphic TypeScript/JavaScript library (an npm module) that can execute in both the browser and Node.js/Edge environments. Once isolated, we can wrap this library in the two industry-standard specifications depending on where the agent lives: MCP servers and OpenAPI specs (to run on Edge functions)