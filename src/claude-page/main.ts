// Entry point for the COI Hero Claude page (built by scripts/build-claude-page.mjs).
import { mount } from "./app";

const root = document.getElementById("app");
if (root) mount(root);
