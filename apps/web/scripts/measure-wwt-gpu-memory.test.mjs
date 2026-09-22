import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNotAborted,
  assertRendererBoundToDrm,
  assertRequestedUrlState,
  assertSameProcessIdentity,
  buildEvidenceArtifact,
  findBrowserAndGpuProcesses,
  parseArgs,
  parseDrmFdinfo,
  requestedDeepSkyHrefs,
  resolveOutputPath,
  summarizeDrmFdinfo,
} from "./measure-wwt-gpu-memory.mjs";

test("parses bounded operator arguments and requires the deep-sky route", () => {
  assert.deepEqual(
    parseArgs([
      "--url",
      "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2&object=messier-31",
      "--cycles",
      "4",
      "--settle-ms",
      "2500",
    ]),
    {
      cycles: 4,
      output: null,
      settleMs: 2500,
      url: "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2&object=messier-31",
    },
  );
  assert.throws(() => parseArgs([]), /--url is required/u);
  assert.throws(
    () => parseArgs(["--url", "http://127.0.0.1:3000/explore"]),
    /\/explore\/deep-sky/u,
  );
  assert.throws(
    () => parseArgs(["--url", "http://127.0.0.1:3000/explore/deep-sky?object=messier-31"]),
    /explicit object and layer/u,
  );
  assert.throws(
    () =>
      parseArgs([
        "--url",
        "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2&object=messier-31",
        "--cycles",
        "99",
      ]),
    /no greater than 8/u,
  );
});

test("requires the exact requested deep-sky query state regardless of parameter ordering", () => {
  assert.doesNotThrow(() =>
    assertRequestedUrlState(
      "http://127.0.0.1:3000/explore/deep-sky?object=messier-31&layer=visible-dss2",
      "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2&object=messier-31",
    ),
  );
  assert.throws(
    () =>
      assertRequestedUrlState(
        "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2",
        "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2&object=messier-31",
      ),
    /query state/u,
  );
});

test("navigates object-first before selecting a non-default deep-sky layer", () => {
  assert.deepEqual(
    requestedDeepSkyHrefs(
      "http://127.0.0.1:3000/explore/deep-sky?layer=infrared-wise&object=messier-31",
    ),
    [
      "/explore/deep-sky",
      "/explore/deep-sky?layer=visible-dss2&object=messier-31",
      "/explore/deep-sky?layer=infrared-wise&object=messier-31",
    ],
  );
  assert.deepEqual(
    requestedDeepSkyHrefs(
      "http://127.0.0.1:3000/explore/deep-sky?layer=visible-dss2&object=messier-31",
    ),
    ["/explore/deep-sky", "/explore/deep-sky?layer=visible-dss2&object=messier-31"],
  );
});

test("resolves relative evidence output from the repository root", () => {
  assert.match(
    resolveOutputPath("data/audits/phase-8d-gpu-memory-v1.json"),
    /\/Lumina\/data\/audits\/phase-8d-gpu-memory-v1\.json$/u,
  );
  assert.equal(resolveOutputPath("/tmp/lumina-gpu.json"), "/tmp/lumina-gpu.json");
});

test("parses Linux DRM fdinfo memory counters", () => {
  assert.deepEqual(
    parseDrmFdinfo(`drm-driver:\ti915
drm-client-id:\t42
drm-pdev:\t0000:00:02.0
drm-total-system0:\t300000 KiB
drm-shared-system0:\t70000 KiB
drm-active-system0:\t41000 KiB
drm-resident-system0:\t180000 KiB
drm-purgeable-system0:\t5000 KiB
drm-engine-render:\t9000 ns
`),
    {
      clientId: "42",
      countersKiB: {
        "active-system0": 41000,
        "purgeable-system0": 5000,
        "resident-system0": 180000,
        "shared-system0": 70000,
        "total-system0": 300000,
      },
      driver: "i915",
      pdev: "0000:00:02.0",
    },
  );
});

test("normalizes bytes and MiB and accepts drm-memory aliases", () => {
  const parsed = parseDrmFdinfo(`drm-driver:\ti915
drm-client-id:\t42
drm-pdev:\t0000:00:02.0
drm-total-system0:\t2048
drm-resident-system0:\t2 MiB
drm-memory-vram0:\t512 KiB
`);
  assert.deepEqual(parsed?.countersKiB, {
    "memory-vram0": 512,
    "resident-system0": 2048,
    "total-system0": 2,
  });
});

test("fails closed on malformed DRM memory counters", () => {
  assert.throws(
    () =>
      parseDrmFdinfo(`drm-driver:\ti915
drm-client-id:\t42
drm-pdev:\t0000:00:02.0
drm-resident-system0:\tnot-a-number KiB
`),
    /Malformed DRM memory counter/u,
  );
});

test("deduplicates repeated file descriptors for the same DRM client", () => {
  const summary = summarizeDrmFdinfo([
    {
      clientId: "42",
      countersKiB: { "active-system0": 40000, "resident-system0": 180000 },
      driver: "i915",
      pdev: "0000:00:02.0",
    },
    {
      clientId: "42",
      countersKiB: { "active-system0": 42000, "resident-system0": 180000 },
      driver: "i915",
      pdev: "0000:00:02.0",
    },
  ]);
  assert.deepEqual(summary, {
    clients: [
      {
        clientId: "42",
        countersKiB: {
          "active-system0": 42000,
          "resident-system0": 180000,
        },
        driver: "i915",
        pdev: "0000:00:02.0",
      },
    ],
    device: { driver: "i915", pdev: "0000:00:02.0" },
  });
});

test("fails closed for empty counters and multiple devices while preserving same-device clients", () => {
  assert.throws(
    () =>
      summarizeDrmFdinfo([
        { clientId: "42", countersKiB: {}, driver: "i915", pdev: "0000:00:02.0" },
      ]),
    /no Linux DRM memory counters/u,
  );
  const sameDevice = summarizeDrmFdinfo([
    {
      clientId: "42",
      countersKiB: { "resident-system0": 10 },
      driver: "i915",
      pdev: "0000:00:02.0",
    },
    {
      clientId: "43",
      countersKiB: { "resident-system0": 20 },
      driver: "i915",
      pdev: "0000:00:02.0",
    },
  ]);
  assert.deepEqual(
    sameDevice.clients.map((client) => client.clientId),
    ["42", "43"],
  );
  assert.throws(
    () =>
      summarizeDrmFdinfo([
        {
          clientId: "42",
          countersKiB: { "resident-system0": 10 },
          driver: "i915",
          pdev: "0000:00:02.0",
        },
        {
          clientId: "99",
          countersKiB: { "memory-vram0": 20 },
          driver: "nvidia",
          pdev: "0000:01:00.0",
        },
      ]),
    /multiple DRM devices/u,
  );
  assert.deepEqual(
    summarizeDrmFdinfo(
      [{ clientId: "42", countersKiB: {}, driver: "i915", pdev: "0000:00:02.0" }],
      { allowEmpty: true },
    ),
    {
      clients: [{ clientId: "42", countersKiB: {}, driver: "i915", pdev: "0000:00:02.0" }],
      device: { driver: "i915", pdev: "0000:00:02.0" },
    },
  );
});

test("finds the dedicated browser and descendant GPU process", () => {
  const userDataDir = "/tmp/lumina-profile";
  assert.deepEqual(
    findBrowserAndGpuProcesses(
      [
        {
          argv: ["chrome", `--user-data-dir=${userDataDir}`],
          pid: 100,
          ppid: 1,
          startTimeTicks: "1000",
        },
        {
          argv: ["chrome", "--type=zygote"],
          pid: 101,
          ppid: 100,
          startTimeTicks: "1001",
        },
        {
          argv: ["chrome", "--type=gpu-process", "--render-node-override=/dev/dri/renderD128"],
          pid: 102,
          ppid: 101,
          startTimeTicks: "1002",
        },
      ],
      userDataDir,
    ),
    {
      browser: { pid: 100, startTimeTicks: "1000" },
      gpu: { pid: 102, renderNode: "/dev/dri/renderD128", startTimeTicks: "1002" },
    },
  );
});

test("process discovery rejects profile-prefix collisions and ambiguous processes", () => {
  const base = {
    pid: 100,
    ppid: 1,
    startTimeTicks: "1000",
  };
  assert.equal(
    findBrowserAndGpuProcesses(
      [
        { ...base, argv: ["chrome", "--user-data-dir=/tmp/profile-1234"] },
        {
          argv: ["chrome", "--type=gpu-process"],
          pid: 101,
          ppid: 100,
          startTimeTicks: "1001",
        },
      ],
      "/tmp/profile-123",
    ),
    null,
  );

  assert.throws(
    () =>
      findBrowserAndGpuProcesses(
        [
          { ...base, argv: ["chrome", "--user-data-dir=/tmp/profile"] },
          {
            argv: ["chrome", "--user-data-dir", "/tmp/profile"],
            pid: 200,
            ppid: 1,
            startTimeTicks: "2000",
          },
        ],
        "/tmp/profile",
      ),
    /multiple browser processes/u,
  );

  assert.deepEqual(
    findBrowserAndGpuProcesses(
      [
        {
          argv: ["chrome --no-sandbox --user-data-dir=/tmp/profile about:blank"],
          pid: 300,
          ppid: 1,
          startTimeTicks: "3000",
        },
        {
          argv: ["chrome --type=zygote --user-data-dir=/tmp/profile"],
          pid: 301,
          ppid: 300,
          startTimeTicks: "3001",
        },
        {
          argv: [
            "chrome --type=gpu-process --user-data-dir=/tmp/profile --render-node-override=/dev/dri/renderD128",
          ],
          pid: 302,
          ppid: 301,
          startTimeTicks: "3002",
        },
      ],
      "/tmp/profile",
    ),
    {
      browser: { pid: 300, startTimeTicks: "3000" },
      gpu: { pid: 302, renderNode: "/dev/dri/renderD128", startTimeTicks: "3002" },
    },
  );
});

test("process identity fails closed on restart or PID reuse", () => {
  const expected = {
    browser: { pid: 100, startTimeTicks: "1000" },
    gpu: { pid: 102, renderNode: "/dev/dri/renderD128", startTimeTicks: "1002" },
  };
  assert.doesNotThrow(() => assertSameProcessIdentity(expected, structuredClone(expected)));
  assert.throws(
    () =>
      assertSameProcessIdentity(expected, {
        browser: { pid: 100, startTimeTicks: "1000" },
        gpu: { pid: 102, renderNode: "/dev/dri/renderD128", startTimeTicks: "9999" },
      }),
    /gpu process identity changed/u,
  );
});

test("binds a recognized WebGL renderer to the sampled Chromium DRM render node", () => {
  const binding = {
    driver: "i915",
    pdev: "0000:00:02.0",
    renderNode: "/dev/dri/renderD128",
    vendorId: "0x8086",
  };
  assert.doesNotThrow(() =>
    assertRendererBoundToDrm(
      { renderer: "ANGLE (Intel, Mesa Intel Graphics)", vendor: "Google Inc. (Intel)" },
      binding,
      { driver: "i915", pdev: "0000:00:02.0" },
    ),
  );
  assert.throws(
    () =>
      assertRendererBoundToDrm(
        { renderer: "ANGLE (NVIDIA GeForce RTX)", vendor: "NVIDIA" },
        binding,
        { driver: "i915", pdev: "0000:00:02.0" },
      ),
    /does not match/u,
  );
  assert.throws(
    () =>
      assertRendererBoundToDrm(
        { renderer: "ANGLE (Intel, Mesa Intel Graphics)", vendor: "Intel" },
        binding,
        { driver: "amdgpu", pdev: "0000:01:00.0" },
      ),
    /does not match the sampled DRM device/u,
  );
});

test("aborts evidence generation after a received signal", () => {
  assert.doesNotThrow(() => assertNotAborted(false, null));
  assert.throws(() => assertNotAborted(true, "SIGINT"), /SIGINT/u);
});

test("evidence builder emits the tracked observational schema", () => {
  const client = {
    clientId: "42",
    countersKiB: { "resident-system0": 50 },
    driver: "i915",
    pdev: "0000:00:02.0",
  };
  const artifact = buildEvidenceArtifact({
    baseline: {
      clients: [{ ...client, countersKiB: {} }],
      device: { driver: "i915", pdev: "0000:00:02.0" },
    },
    buildCommit: "abc123",
    cycles: [
      {
        active: {
          clients: [{ ...client, countersKiB: { "resident-system0": 150 } }],
          device: { driver: "i915", pdev: "0000:00:02.0" },
        },
        cycle: 1,
        postLeave: {
          clients: [{ ...client, countersKiB: { "resident-system0": 60 } }],
          device: { driver: "i915", pdev: "0000:00:02.0" },
        },
      },
    ],
    dirtyPaths: ["data/audits/example.json"],
    measurementCommand: "pnpm example",
    observedAt: "2026-09-22T00:00:00.000Z",
    renderer: {
      debugRendererAvailable: true,
      renderer: "Intel",
      vendor: "Intel",
      version: "WebGL 2",
    },
    rendererClassification: { kind: "hardware", reason: "fixture" },
    renderNodeIdentity: {
      driver: "i915",
      pdev: "0000:00:02.0",
      renderNode: "/dev/dri/renderD128",
      vendorId: "0x8086",
    },
    settleMs: 5000,
    targetIdentity: {
      manifestUrl: "http://127.0.0.1:3000/manifest.webmanifest",
      name: "Lumina",
      scope: "/",
      shortName: "Lumina",
      startUrl: "/",
    },
  });
  assert.equal(artifact.instrumentation, "linux-drm-fdinfo-v2");
  assert.equal(artifact.assessment.conclusion, "observational_only");
  assert.equal(artifact.drm.render_node, "/dev/dri/renderD128");
  assert.equal(artifact.drm.renderer_binding_verified, true);
  assert.deepEqual(artifact.measurements, [
    {
      active_clients: [{ client_id: "42", counters_kib: { "resident-system0": 150 } }],
      cycle: 1,
      post_leave_clients: [{ client_id: "42", counters_kib: { "resident-system0": 60 } }],
    },
  ]);
  assert.match(artifact.derived_observation.note, /preserved independently/u);
  assert.deepEqual(artifact.derived_observation.post_leave_resident_by_client, {
    42: {
      final_is_max: true,
      final_kib: 60,
      first_kib: 60,
      max_kib: 60,
      series_kib: [60],
    },
  });
});
