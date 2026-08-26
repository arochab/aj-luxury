import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const projectRoot = fileURLToPath(projectFile("."));
const execFileAsync = promisify(execFile);

const videoFiles = [
  "public/videos/aj-luxury-hero-v4-motion-portrait-720x934.mp4",
  "public/videos/aj-luxury-hero-v4-motion-tablet-1440x810.mp4",
  "public/videos/aj-luxury-hero-v4-motion-desktop-1920x1080.mp4",
  "public/videos/aj-luxury-hero-v4-motion-xl-native-1920x1080.mp4",
];

test("the hero film uses only responsive derivatives of the approved V4 poster", async () => {
  const [hero, motion, builder, proof, packageJson] = await Promise.all([
    readFile(projectFile("app/components/StaticProductionHero.tsx"), "utf8"),
    readFile(projectFile("app/components/ProductionHeroMotion.tsx"), "utf8"),
    readFile(projectFile("scripts/build_hero_v4_motion.py"), "utf8"),
    readFile(projectFile("scripts/build_hero_motion_proof.py"), "utf8"),
    readFile(projectFile("package.json"), "utf8").then(JSON.parse),
  ]);

  assert.match(hero, /v4-motion-from-approved-poster/);
  assert.match(hero, /hero-v4-portrait-480x623-poster\.webp/);
  assert.match(hero, /hero-v4-tablet-1440x810-poster\.webp/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /saveData/);
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /visibilitychange/);
  assert.match(motion, /preload="none"/);
  assert.match(motion, /\sloop(?:\s|=)/);
  assert.match(motion, /\.mp4\?v=6/);
  assert.doesNotMatch(`${hero}\n${motion}`, /https?:\/\//i);
  assert.match(builder, /Only retained AJ Luxury pixels are used/);
  assert.match(builder, /hero-v4-portrait-720x934-poster\.webp/);
  assert.doesNotMatch(builder, /imagegen|generated_images|hero-v6|hero-v7/i);
  assert.match(builder, /FPS = 30/);
  assert.match(builder, /DURATION_SECONDS = 5\.6/);
  assert.match(builder, /seconds - 0\.06/);
  assert.match(builder, /seconds - 4\.32/);
  assert.doesNotMatch(proof, /from build_hero_v4_motion|import build_hero_v4_motion/);
  assert.match(proof, /def poster_derived_calf/);
  assert.match(proof, /cv2\.grabCut/);
  assert.match(proof, /held-out interior seed/);
  assert.doesNotMatch(proof, /HALO_SILHOUETTES|protection_matte/);
  for (const copiedProductionCalfVertex of [
    "(0.435, 0.565)",
    "(0.550, 0.540)",
    "(0.625, 0.620)",
    "(0.635, 0.700)",
    "(0.580, 0.760)",
    "(0.605, 0.840)",
    "(0.665, 1.000)",
    "(0.565, 1.000)",
    "(0.520, 0.850)",
    "(0.495, 0.740)",
  ]) {
    assert.doesNotMatch(
      proof,
      new RegExp(copiedProductionCalfVertex.replaceAll(".", "\\.").replaceAll("(", "\\(").replaceAll(")", "\\)")),
      `proof reuses production calf vertex ${copiedProductionCalfVertex}`,
    );
  }
  assert.equal(
    packageJson.scripts["test:hero-motion"],
    "node --test tests/production-hero-motion.test.mjs",
  );
  assert.match(packageJson.scripts.test, /npm run test:hero-motion/);
  for (const region of ["face", "underwear", "chair", "foot", "shin", "calf"]) {
    assert.match(proof, new RegExp(`"${region}"`));
  }
  for (const rendition of [
    "portrait-720x934",
    "tablet-1440x810",
    "desktop-1920x1080",
    "xl-native-1920x1080",
  ]) {
    assert.match(proof, new RegExp(rendition));
  }

  for (const file of videoFiles) {
    assert.match(motion, new RegExp(file.replace("public", "").replaceAll(".", "\\.")));
  }
});

test("the canonical gate decodes and proves all four exact hero MP4s", { timeout: 240_000 }, async () => {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await execFileAsync(
      python,
      [fileURLToPath(projectFile("scripts/build_hero_motion_proof.py"))],
      {
        cwd: projectRoot,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 230_000,
        windowsHide: true,
      },
    ));
  } catch (error) {
    assert.fail(
      [
        "hero-motion proof gate exited nonzero",
        error.stdout || "",
        error.stderr || error.message,
      ].filter(Boolean).join("\n"),
    );
  }

  assert.match(stdout, /^PASS hero-motion proof:/m, stderr);
  const canonicalDirectory = "artifacts/hero-motion-v4-proof/canonical-r2";
  const manifest = JSON.parse(
    await readFile(projectFile(`${canonicalDirectory}/hero-motion-proof-manifest.json`), "utf8"),
  );
  assert.equal(manifest.status, "PASS");
  assert.equal(manifest.gate.command, "npm run test:hero-motion");
  assert.deepEqual(manifest.gate.exact_video_paths, videoFiles);
  assert.deepEqual(
    manifest.inputs.videos.map(({ path }) => path),
    videoFiles,
  );
  assert.equal(manifest.renditions.length, 4);
  assert.equal(manifest.retained_evidence.length, 8);
  assert.deepEqual(manifest.failures, []);
  assert.match(manifest.manifest_hash.canonical_payload_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    (await readdir(projectFile(canonicalDirectory))).sort(),
    manifest.canonical_directory_inventory,
    "canonical proof directory contains stale or undeclared outputs",
  );

  const hashedRecords = [
    ...manifest.inputs.videos,
    ...manifest.inputs.source_posters,
    manifest.inputs.generator,
    manifest.inputs.proof_script,
    manifest.inputs.test,
    ...manifest.retained_evidence,
  ];
  for (const record of hashedRecords) {
    assert.match(record.sha256, /^[a-f0-9]{64}$/, `${record.path} has no SHA256`);
  }

  for (const rendition of manifest.renditions) {
    assert.equal(rendition.media.codec, "h264", `${rendition.name} codec`);
    assert.equal(rendition.media.audio_stream_count, 0, `${rendition.name} audio`);
    assert.equal(rendition.media.fps, 30, `${rendition.name} fps`);
    assert.equal(rendition.media.duration_seconds, 5.6, `${rendition.name} duration`);
    assert.equal(rendition.media.probed_frame_count, 168, `${rendition.name} probed frames`);
    assert.equal(rendition.media.decoded_frame_count, 168, `${rendition.name} decoded frames`);
    assert.equal(rendition.media.fast_start, true, `${rendition.name} fast-start`);
    assert.match(
      rendition.masks.actual_calf_segmentation.method,
      /poster Lab-colour likelihood.*GrabCut.*held-out seed-connected component/,
    );
    assert.ok(
      rendition.masks.actual_calf_segmentation.seed_coverage_percent >= 99.5,
      `${rendition.name} real-calf seed coverage`,
    );
    assert.ok(
      rendition.masks.actual_calf_segmentation.boundary_edge_support_percent >= 10,
      `${rendition.name} real-calf poster-edge support`,
    );
    assert.equal(
      rendition.masks.actual_calf_segmentation.annulus_subject_overlap_percent,
      0,
      `${rendition.name} real-calf annulus overlap`,
    );
    assert.ok(rendition.onset.detected_seconds <= 0.25, `${rendition.name} onset`);
    assert.ok(
      rendition.free_floor_coverage_at_2s_percent >= 80,
      `${rendition.name} free-floor coverage at 2s`,
    );
    assert.equal(rendition.hold_windows.length, 23, `${rendition.name} hold windows`);
    for (const window of rendition.hold_windows) {
      for (const key of [
        "free_floor_coverage_percent",
        "free_floor_motion_percent",
        "adjacent_annulus_coverage_percent",
        "adjacent_annulus_motion_percent",
      ]) {
        assert.ok(
          window[key] >= 30,
          `${rendition.name} ${window.start_seconds}-${window.end_seconds}s ${key}`,
        );
      }
    }
    for (const [region, contamination] of Object.entries(rendition.subject_contamination)) {
      assert.ok(
        contamination.max_hold_mean_delta <= contamination.mean_delta_limit,
        `${rendition.name} ${region} mean contamination`,
      );
      assert.ok(
        contamination.max_hold_p95_delta <= contamination.p95_delta_limit,
        `${rendition.name} ${region} p95 contamination`,
      );
    }
  }

  // Container bytes are checked here too so the JS gate fails before trusting
  // any stale manifest that might have been left by an interrupted decoder.
  for (const file of videoFiles) {
    const [bytes, metadata] = await Promise.all([
      readFile(projectFile(file)),
      stat(projectFile(file)),
    ]);
    const ftyp = bytes.indexOf(Buffer.from("ftyp"));
    const moov = bytes.indexOf(Buffer.from("moov"));
    const mdat = bytes.indexOf(Buffer.from("mdat"));

    assert.ok(metadata.size > 128 * 1024, `${file} is unexpectedly small`);
    assert.ok(metadata.size < 9 * 1024 * 1024, `${file} exceeds 9 MB`);
    assert.ok(ftyp >= 0 && ftyp < 32, `${file} has no MP4 header`);
    assert.ok(moov > ftyp && mdat > moov, `${file} is not fast-start encoded`);
    assert.ok(bytes.indexOf(Buffer.from("avc1")) >= 0, `${file} has no H.264 track`);
    assert.equal(bytes.indexOf(Buffer.from("mp4a")), -1, `${file} contains audio`);
    assert.equal(bytes.indexOf(Buffer.from("soun")), -1, `${file} contains audio`);
  }
});
