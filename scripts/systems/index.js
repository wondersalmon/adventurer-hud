import { dnd5eAdapter } from "./dnd5e.js";
import {
  defineSystemAdapter,
  getSystemAdapter,
  hasSystemAdapter,
  listSystemAdapters,
  registerSystemAdapter
} from "./registry.js";

registerSystemAdapter(dnd5eAdapter);

export {
  defineSystemAdapter,
  getSystemAdapter,
  hasSystemAdapter,
  listSystemAdapters,
  registerSystemAdapter
};
