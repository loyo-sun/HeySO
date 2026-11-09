import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toolSchemas,
  commandDescriptions,
} from "../src/baizefig-contracts.mjs";
import { cloudToolSchemas } from "../src/bridge.mjs";

test("cloud apply accepts the published example with an optional valid lease", () => {
  const example = JSON.parse(commandDescriptions.apply_commands.split("Minimal request: ")[1].split(". commands,")[0]);
  assert.equal(cloudToolSchemas.apply_commands.safeParse(example).success, true);
  assert.equal(cloudToolSchemas.apply_commands.safeParse({ ...example, lockToken: "807217eb-289b-4e77-b10c-0b4c127683b2" }).success, true);
  assert.equal(cloudToolSchemas.apply_commands.safeParse({ ...example, lockToken: "invalid" }).success, false);
});

test("published minimal example validates for both batch tools", () => {
  const description = commandDescriptions.apply_commands;
  const example = JSON.parse(
    description.split("Minimal request: ")[1].split(". commands,")[0],
  );
  for (const name of ["apply_commands", "preview_commands"]) {
    assert.equal(toolSchemas[name].safeParse(example).success, true);
    const path = structuredClone(example);
    path.commands[0].nodes[0].type = "path";
    path.commands[0].nodes[0].points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ];
    assert.equal(toolSchemas[name].safeParse(path).success, true);
    for (const mutate of [
      (p) => {
        p.commands = { item: p.commands };
      },
      (p) => {
        p.commands[0].nodes = { item: p.commands[0].nodes };
      },
      (p) => {
        p.commands[0].nodes[0].width = "64";
      },
      (p) => {
        p.commands[0].nodes[0].parentId = "";
      },
      (p) => {
        p.commands[0].nodes[0].points = { item: [] };
      },
    ]) {
      const invalid = structuredClone(example);
      mutate(invalid);
      assert.equal(toolSchemas[name].safeParse(invalid).success, false);
    }
  }
});
