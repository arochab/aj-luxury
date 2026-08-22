"use client";

import { useEffect, useRef, useState } from "react";
import {
  nextLazyMountState,
  shouldAnimateMetallicField,
  type MetallicFieldMotion,
} from "../../lib/motion-policy";

export type { MetallicFieldMotion } from "../../lib/motion-policy";
export type MetallicFieldVariant = "graphite" | "silver" | "dusk" | "reference";

type MetallicFieldProps = {
  className?: string;
  motion?: MetallicFieldMotion;
  variant?: MetallicFieldVariant;
};

const STATIC_PHASE = 1.35;
const NORMAL_LOOP_SECONDS = 34;
const SLOW_LOOP_SECONDS = 62;
const MAX_FPS = 30;

function metallicFallback(variant: MetallicFieldVariant) {
  return variant === "reference"
    ? [
        "radial-gradient(circle at 12% 32%, rgba(238,238,239,.88) 0 3%, rgba(82,82,86,.58) 7%, transparent 13%)",
        "radial-gradient(circle at 88% 68%, rgba(230,230,232,.74) 0 5%, rgba(62,62,67,.68) 10%, transparent 18%)",
        "linear-gradient(132deg, transparent 0 15%, rgba(222,222,225,.5) 34%, rgba(78,78,84,.58) 52%, rgba(207,207,210,.44) 68%, transparent 86%)",
        "linear-gradient(42deg, #09090b 0%, #29292d 28%, #747478 48%, #a9a9ac 58%, #36363b 75%, #0b0b0d 100%)",
      ].join(",")
    : [
        "linear-gradient(132deg, transparent 0 20%, rgba(197,198,204,.42) 38%, rgba(103,103,112,.36) 54%, transparent 70%)",
        "linear-gradient(42deg, #121217 0%, #393940 30%, #898990 48%, #b8b8bd 57%, #55545d 72%, #17171c 100%)",
      ].join(",");
}

function MetallicCanvas({
  motion,
  variant,
}: Required<Pick<MetallicFieldProps, "motion" | "variant">>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applyFallback = () => {
      canvas.style.background = metallicFallback(variant);
    };

    const context = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!context) {
      applyFallback();
      return;
    }
    const gl = context;

    const vertexSource = `
      attribute vec2 a_position;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision highp float;

      uniform vec2 u_resolution;
      uniform float u_phase;
      uniform float u_variant;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 eased = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), eased.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), eased.x),
          eased.y
        );
      }

      float lowFrequencyNoise(vec2 p) {
        float value = 0.0;
        float amplitude = 0.62;

        for (int octave = 0; octave < 2; octave++) {
          value += amplitude * noise(p);
          p = p * 1.86 + vec2(7.3, 11.9);
          amplitude *= 0.42;
        }

        return value;
      }

      /* ── LE STUDIO QUE LE MÉTAL RÉFLÉCHIT ───────────────────────────────
         Adam, 22/08 : « il faut absolument du liquide métallique ». Regardé
         au navigateur : la surface précédente était OMBRÉE, pas
         RÉFLÉCHISSANTE. C'est la différence entre du marbre et du chrome, et
         aucun réglage de contraste ne la franchit.

         Un métal poli ne possède presque pas de couleur propre : ce qu'on
         voit sur lui est l'image du lieu où il se trouve. Tant qu'il n'y a
         rien à réfléchir, il ne peut pas ressembler à du métal.

         Cette fonction est donc le décor. Un studio noir, un plafond clair,
         deux rampes de lampes, et surtout UNE LIGNE D'HORIZON DURE — c'est
         elle qui trace sur chaque pli la coupure nette clair/sombre par
         laquelle l'œil reconnaît une surface miroir.

         Elle ne dépend que de la direction du reflet. Aucun terme temporel,
         donc la périodicité de la boucle reste intacte. */
      float studio(vec3 direction) {
        float y = direction.y;
        float x = direction.x;

        // L'horizon. Volontairement etroit : une transition douce donnerait
        // un degrade, et un degrade ne se lit jamais comme un reflet.
        float ciel = smoothstep(-0.035, 0.055, y);
        float valeur = mix(0.022, 0.60, ciel);

        // Le sol absorbe : sous l'horizon, le metal doit plonger vers le noir.
        valeur = mix(valeur, 0.012, (1.0 - smoothstep(-0.62, -0.14, y)) * 0.85);

        // Deux rampes de lampes. Ce sont elles qui deviennent les coulees
        // blanches qui glissent sur les plis quand la surface ondule.
        float rampeHaute =
          smoothstep(0.30, 0.355, y) * (1.0 - smoothstep(0.50, 0.565, y));
        float rampeBasse =
          smoothstep(-0.40, -0.355, y) * (1.0 - smoothstep(-0.235, -0.185, y));
        valeur += rampeHaute * 0.95 + rampeBasse * 0.42;

        // Une lueur laterale, pour que les plis de profil ne soient pas morts.
        valeur += smoothstep(0.55, 0.98, abs(x)) * 0.16;

        return clamp(valeur, 0.0, 1.5);
      }

      vec2 chromeOrb(vec2 p, vec2 center, float radius, float offset) {
        vec2 local = (p - center) / radius;
        float radiusSquared = dot(local, local);
        float mask = 1.0 - smoothstep(0.88, 1.02, radiusSquared);
        float z = sqrt(max(0.0, 1.0 - radiusSquared));
        vec3 normal = normalize(vec3(local, z));

        float horizon = smoothstep(-0.56, 0.72, normal.y);
        float sweep = sin(normal.y * 5.2 + offset + u_phase) * 0.5 + 0.5;
        float highlight = pow(
          max(0.0, dot(normal, normalize(vec3(-0.48, 0.58, 0.78)))),
          10.0
        );
        float rim = smoothstep(0.54, 0.98, radiusSquared);
        float shade = mix(0.035, 0.66, horizon);
        shade = mix(shade, 0.96, smoothstep(0.72, 0.96, sweep) * 0.44);
        shade += highlight * 0.54 + rim * 0.12;
        shade *= 0.82 + z * 0.18;

        return vec2(mask, clamp(shade, 0.0, 1.0));
      }

      float liquidHeight(vec2 p) {
        float phase = u_phase + u_variant * 0.74;
        vec2 driftA = vec2(cos(phase), sin(phase)) * 0.34;
        vec2 driftB = vec2(cos(phase + 2.1), sin(phase + 2.1)) * 0.29;

        float warpX = lowFrequencyNoise(p * 0.78 + driftA);
        float warpY = lowFrequencyNoise(
          vec2(-p.y, p.x) * 0.74 + driftB + vec2(8.7, 3.2)
        );
        vec2 warped = p + (vec2(warpX, warpY) - 0.52) * 1.28;

        mat2 diagonal = mat2(
          0.82, -0.57,
          0.57, 0.82
        );
        vec2 diagonalP = diagonal * warped;

        float longFold = sin(
          diagonalP.x * 1.08 +
          diagonalP.y * 0.48 +
          warpY * 0.94 +
          phase * 0.34
        );
        return
          warpX * 0.66 +
          warpY * 0.40 +
          longFold * 0.28;
      }

      float referenceHeight(vec2 p) {
        float phase = u_phase;
        vec2 drift = vec2(cos(phase), sin(phase)) * 0.18;
        float fieldA = lowFrequencyNoise(p * 1.34 + drift + vec2(2.1, 7.4));
        float fieldB = lowFrequencyNoise(
          vec2(-p.y, p.x) * 1.12 -
          drift +
          vec2(9.2, 1.7)
        );
        vec2 warped = p + (vec2(fieldA, fieldB) - 0.5) * 0.94;

        float foldA = sin(
          warped.x * 2.15 +
          warped.y * 0.84 +
          fieldB * 3.4 +
          phase
        );
        float foldB = sin(
          warped.y * 2.52 -
          warped.x * 0.58 +
          fieldA * 2.8 -
          phase
        );

        return fieldA * 0.50 + fieldB * 0.32 + foldA * 0.24 + foldB * 0.16;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.15;

        float epsilon = 2.8 / min(u_resolution.x, u_resolution.y);
        float height = liquidHeight(p);
        float heightX = liquidHeight(p + vec2(epsilon, 0.0));
        float heightY = liquidHeight(p + vec2(0.0, epsilon));

        vec2 gradient = vec2(heightX - height, heightY - height) / epsilon;
        vec3 normal = normalize(vec3(-gradient * 0.72, 1.0));
        vec3 viewDirection = vec3(0.0, 0.0, 1.0);
        vec3 reflection = reflect(-viewDirection, normal);

        float environmentY = clamp(reflection.y * 0.5 + 0.5, 0.0, 1.0);
        float environmentX = clamp(reflection.x * 0.5 + 0.5, 0.0, 1.0);
        float softSilver = smoothstep(0.02, 0.86, environmentY);
        float sideLight = smoothstep(0.12, 0.92, environmentX);

        vec3 ink = vec3(0.052, 0.052, 0.064);
        vec3 pewter = vec3(0.30, 0.305, 0.33);
        vec3 satin = vec3(0.56, 0.565, 0.59);
        vec3 pearl = vec3(0.77, 0.775, 0.80);
        vec3 plumReflection = vec3(0.10, 0.066, 0.116);

        vec3 material = mix(ink, satin, softSilver);
        material = mix(material, pewter, (1.0 - sideLight) * 0.24);

        float broadSpecular = pow(
          max(0.0, dot(normal, normalize(vec3(-0.48, 0.62, 0.78)))),
          1.18
        );
        float slope = clamp(length(gradient) * 0.10, 0.0, 1.0);
        material = mix(material, pearl, broadSpecular * 0.16);
        material = mix(material, pewter, slope * 0.13);

        float ribbonA = smoothstep(
          0.48,
          0.88,
          sin((uv.x * 0.76 + uv.y * 0.38) * 6.283 + u_phase * 0.24 + u_variant) * 0.5 + 0.5
        );
        float ribbonB = smoothstep(
          0.60,
          0.94,
          sin((uv.y * 0.58 - uv.x * 0.31) * 6.283 - u_phase * 0.18 + 2.4) * 0.5 + 0.5
        );
        material = mix(material, pearl, ribbonA * 0.065 + ribbonB * 0.05);

        float satinSweep = smoothstep(
          0.18,
          0.92,
          sin(
            (uv.x * 0.72 + uv.y * 0.46) * 6.283 +
            height * 1.55 +
            u_phase * 0.1
          ) * 0.5 + 0.5
        );
        material = mix(material, satin + plumReflection * 0.08, satinSweep * 0.095);

        float softCrest = smoothstep(0.56, 0.96, height);
        float softValley = 1.0 - smoothstep(0.12, 0.54, height);
        material = mix(material, pearl, softCrest * 0.22);
        material = mix(material, pewter, softValley * 0.16);

        float flowingTone = sin(
          height * 5.15 +
          p.x * 0.72 +
          p.y * 0.38 -
          u_phase * 0.12
        ) * 0.5 + 0.5;
        float flowingLight = smoothstep(0.24, 0.88, flowingTone);
        material = mix(material, mix(pewter, pearl, flowingLight), 0.38);

        float silverVariant = step(0.5, u_variant) * (1.0 - step(1.5, u_variant));
        float duskVariant = step(1.5, u_variant);
        material = mix(material, material * 1.055 + pearl * 0.025, silverVariant);
        material += plumReflection * (0.04 + 0.03 * (1.0 - uv.y) + duskVariant * 0.13);
        material *= 1.0 - duskVariant * 0.08;

        float referenceVariant = step(2.5, u_variant);
        float finalDepth = smoothstep(0.12, 0.90, height);
        if (referenceVariant > 0.5) {
          /*
           * The homepage treatment translates the four motion references chosen
           * by the client: broad liquid folds, a sculptural chrome mass, floating
           * metallic droplets and a softer fluid membrane. Everything remains
           * procedural so the result is original, seamless and watermark-free.
           */
          vec2 scene = (uv - 0.5) * vec2(aspect, 1.0);
          float edgePresence = smoothstep(0.08, 0.48, abs(uv.x - 0.5));

          float referenceSurface = referenceHeight(p);
          float referenceSurfaceX = referenceHeight(p + vec2(epsilon, 0.0));
          float referenceSurfaceY = referenceHeight(p + vec2(0.0, epsilon));
          vec2 referenceGradient = vec2(
            referenceSurfaceX - referenceSurface,
            referenceSurfaceY - referenceSurface
          ) / epsilon;
          vec3 referenceNormal = normalize(vec3(-referenceGradient * 0.78, 1.0));
          vec3 referenceReflection = reflect(
            -viewDirection,
            referenceNormal
          );
          float referenceEnvironment = clamp(
            referenceReflection.y * 0.52 +
            referenceReflection.x * 0.18 +
            0.5,
            0.0,
            1.0
          );
          /* 13.2 et non 8.4 : la frequence des plis. A 8.4 la surface n'offre
             que de grandes masses molles — a l'ecran ca lit « fumee », pas
             « chrome ». Plus de plis par ecran, donc plus d'aretes, donc de la
             MATIERE. Terme purement spatial : la periodicite de la boucle, qui
             ne depend que de u_phase, n'est pas touchee. */
          float membrane = sin(
            referenceSurface * 13.2 +
            referenceReflection.x * 2.6 +
            u_phase
          ) * 0.5 + 0.5;
          float membraneLight = smoothstep(0.48, 0.78, membrane);
          float membraneShadow = 1.0 - smoothstep(0.20, 0.48, membrane);
          /* LE MÉTAL EST CE QU'IL RÉFLÉCHIT. On échantillonne le studio dans
             la direction du reflet, et cette valeur EST la matière — elle
             n'est plus une teinte qu'on éclaire. Trois échantillons décalés
             sur la normale donnent une très légère dispersion colorée, celle
             qu'un chrome réel montre sur ses arêtes.

             Le facteur 1.9 sur la normale creuse les plis : plus la surface
             s'incline, plus le reflet balaie vite le décor, et plus la ligne
             d'horizon vient trancher le pli. C'est là que naît l'impression
             de liquide. */
          /* ── LE MICRO-RELIEF, ET POURQUOI IL FAIT LE « LIQUIDE » ────────
             Regardé au navigateur après la première passe : avec le seul
             studio réfléchi, chaque masse revenait presque UNIE. Le résultat
             lisait « chrome découpé », graphique, pas coulant.

             Ce qui manquait n'est pas du contraste, c'est du RELIEF FIN. Sur
             du mercure, l'œil suit des ondes serrées qui glissent à
             l'intérieur de chaque masse ; ce sont elles qui disent que la
             matière coule au lieu d'être une découpe.

             Les ondes se posent donc sur la normale, pas sur la couleur : le
             reflet balaie le studio plus vite, et les bandes du décor
             s'enroulent dans le pli. Leur amplitude suit la pente, pour que
             les zones plates restent des miroirs calmes et que seules les
             courbures s'animent. Termes purement spatiaux. */
          float pente = clamp(length(referenceGradient) * 0.42, 0.0, 1.0);
          vec2 ondes = vec2(
            sin(p.x * 21.0 + referenceSurface * 8.6) +
              0.6 * sin(p.y * 33.0 - referenceSurface * 5.4),
            cos(p.y * 19.0 - referenceSurface * 7.8) +
              0.6 * cos(p.x * 29.0 + referenceSurface * 6.2)
          ) * (0.055 + pente * 0.085);

          vec3 normalePlus = normalize(
            referenceNormal + vec3(-referenceGradient * 1.12 + ondes, 0.0)
          );
          vec3 refletCreuse = reflect(-viewDirection, normalePlus);
          float refletR = studio(refletCreuse + vec3(0.014, 0.010, 0.0));
          float refletV = studio(refletCreuse);
          float refletB = studio(refletCreuse - vec3(0.012, 0.009, 0.0));
          vec3 referenceBase = vec3(refletR, refletV, refletB);

          /* La membrane ne colore plus la surface, elle la DÉFORME : elle
             ajoute et retire du reflet selon le pli, au lieu de peindre du
             gris par-dessus. Un métal ne se teinte pas, il se courbe. */
          referenceBase *= 0.74 + membraneLight * 0.52;
          /* 0.72 et non 0.42 : le creux redevient PRESQUE NOIR. Un métal se
             reconnaît d'abord à son écart dynamique — il est quasi noir à
             l'ombre et quasi blanc au reflet. À 0.42 les creux restaient gris
             moyen, et un gris moyen partout, c'est de la fumée. */
          referenceBase = mix(
            referenceBase,
            vec3(0.012, 0.013, 0.017),
            membraneShadow * 0.72
          );
          /* La spéculaire se resserre et gagne en intensité. Sur 0.74-0.86
             elle s'étalait en larges plages laiteuses ; sur 0.795-0.845 elle
             devient une arête de lumière — c'est ce qui sépare un reflet de
             métal poli d'un dégradé gris. */
          float liquidHighlight = smoothstep(0.815, 0.842, membrane);
          referenceBase = mix(
            referenceBase,
            vec3(0.985, 0.987, 0.99),
            liquidHighlight * 0.88
          );

          /* ── CE QUI MANQUAIT POUR QUE ÇA SE MATÉRIALISE ─────────────────
             Adam, 22/08 : « trop abstrait, ça doit se matérialiser beaucoup
             plus directement ». Une spéculaire seule ne suffit pas : elle
             donne des taches claires, pas une SURFACE. Trois signaux sont
             ajoutés ici, et ce sont ceux par lesquels l'œil reconnaît du
             métal poli plutôt qu'un dégradé.

             1. LES BANDES DE REFLET. Un chrome réfléchit un environnement
                structuré, donc il porte des bandes claires et sombres serrées
                qui suivent la courbure. Sans elles, aucune surface ne lit
                comme réfléchissante. Le terme est purement spatial : il ne
                dépend que de la normale, jamais de u_phase, donc la
                périodicité de la boucle reste intacte.

             2. LE LISERÉ. Chaque bande porte une arête très fine et très
                claire. C'est le détail qui donne l'impression de dureté,
                celui qui sépare le métal liquide de la peinture argentée.

             3. LE FRESNEL. Là où la surface s'incline face au regard, un
                métal s'éclaircit franchement. Ça dessine le VOLUME des plis
                au lieu de les laisser plats. */
          float bandes = sin(
            referenceReflection.y * 9.4 +
            referenceReflection.x * 4.1 +
            referenceSurface * 3.2
          ) * 0.5 + 0.5;
          float bandeClaire = smoothstep(0.42, 0.62, bandes);
          float bandeSombre = 1.0 - smoothstep(0.30, 0.50, bandes);
          referenceBase = mix(
            referenceBase,
            vec3(0.90, 0.905, 0.925),
            bandeClaire * 0.30
          );
          referenceBase = mix(
            referenceBase,
            vec3(0.028, 0.029, 0.036),
            bandeSombre * 0.34
          );

          float lisere = smoothstep(0.955, 0.995, bandes);
          referenceBase = mix(
            referenceBase,
            vec3(1.0, 1.0, 1.0),
            lisere * 0.72
          );

          float fresnel = pow(
            1.0 - clamp(referenceNormal.z, 0.0, 1.0),
            1.7
          );
          referenceBase = mix(
            referenceBase,
            vec3(0.93, 0.935, 0.955),
            fresnel * 0.42
          );
          referenceBase = mix(
            referenceBase,
            vec3(0.96, 0.965, 0.97),
            pow(
              max(
                0.0,
                dot(
                  referenceNormal,
                  normalize(vec3(-0.52, 0.58, 0.76))
                )
              ),
              2.2
            ) * 0.34
          );
          float referenceDepth = smoothstep(0.08, 0.88, referenceSurface);
          finalDepth = referenceDepth;
          referenceBase *= 0.68 + referenceDepth * 0.40;
          /* La plage se resserre : 0.075-0.83 au lieu de 0.045-0.91. Tout ce
             qui est sombre plonge vers le noir, tout ce qui est clair monte
             vers le blanc, et la zone grise du milieu — celle qui donnait
             l'impression de brume — se réduit. C'est le même geste qu'un
             contraste en post-production, appliqué ici à la source. */
          referenceBase = smoothstep(
            vec3(0.075),
            vec3(0.83),
            referenceBase
          );

          vec2 orbA = chromeOrb(
            scene,
            vec2(-0.86 + cos(u_phase) * 0.06, 0.34 + sin(u_phase) * 0.05),
            0.12,
            0.4
          );
          vec2 orbB = chromeOrb(
            scene,
            vec2(0.89 + sin(u_phase) * 0.06, -0.28 + cos(u_phase) * 0.04),
            0.15,
            2.1
          );
          vec2 orbC = chromeOrb(
            scene,
            vec2(-1.02 + sin(u_phase + 1.8) * 0.04, -0.40),
            0.07,
            4.0
          );
          vec2 orbD = chromeOrb(
            scene,
            vec2(1.04, 0.38 + cos(u_phase + 0.8) * 0.04),
            0.08,
            5.2
          );

          float orbMask = max(max(orbA.x, orbB.x), max(orbC.x, orbD.x));
          float orbShade =
            orbA.y * orbA.x +
            orbB.y * orbB.x +
            orbC.y * orbC.x +
            orbD.y * orbD.x;
          orbShade /= max(0.001, orbA.x + orbB.x + orbC.x + orbD.x);
          vec3 orbColor = mix(
            vec3(0.045, 0.047, 0.052),
            vec3(0.96, 0.965, 0.97),
            orbShade
          );
          referenceBase = mix(
            referenceBase,
            orbColor,
            orbMask * (0.34 + edgePresence * 0.48)
          );

          float sculpture =
            0.20 / (dot(scene - vec2(-0.48, -0.04), scene - vec2(-0.48, -0.04)) + 0.05) +
            0.16 / (dot(scene - vec2(-0.20, 0.20), scene - vec2(-0.20, 0.20)) + 0.05) +
            0.18 / (dot(scene - vec2(0.44, 0.10), scene - vec2(0.44, 0.10)) + 0.06) +
            0.15 / (dot(scene - vec2(0.60, -0.20), scene - vec2(0.60, -0.20)) + 0.05);
          float sculptureMask = smoothstep(1.08, 1.78, sculpture) * edgePresence;
          float sculptureTone = sin(
            sculpture * 2.4 +
            scene.y * 6.0 -
            scene.x * 2.4 +
            u_phase
          ) * 0.5 + 0.5;
          vec3 sculptureColor = mix(
            vec3(0.035, 0.036, 0.041),
            vec3(0.84, 0.845, 0.86),
            smoothstep(0.18, 0.88, sculptureTone)
          );
          referenceBase = mix(
            referenceBase,
            sculptureColor,
            sculptureMask * 0.30
          );

          float calmCenter = 1.0 - smoothstep(0.08, 0.34, abs(uv.x - 0.5));
          referenceBase *= 1.0 - calmCenter * 0.19;
          material = referenceBase;
        }

        float textileGrain =
          (hash(floor(gl_FragCoord.xy * vec2(0.32, 0.72))) - 0.5) * 0.012 +
          sin(gl_FragCoord.y * 0.72) * 0.0035;
        material += textileGrain;

        vec3 color = material * (0.80 + finalDepth * 0.28);
        color *= mix(0.76 + flowingLight * 0.34, 1.0, referenceVariant);
        float vignette = smoothstep(1.24, 0.16, length((uv - 0.5) * vec2(0.78, 1.0)));
        color *= 0.88 + vignette * 0.13;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function compile(type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    }

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment =
      compile(gl.FRAGMENT_SHADER, fragmentSource) ??
      compile(
        gl.FRAGMENT_SHADER,
        fragmentSource.replace("precision highp float;", "precision mediump float;"),
      );
    const program = gl.createProgram();

    if (!vertex || !fragment || !program) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (program) gl.deleteProgram(program);
      applyFallback();
      return;
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      applyFallback();
      return;
    }

    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      applyFallback();
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, "u_resolution");
    const phase = gl.getUniformLocation(program, "u_phase");
    const variantUniform = gl.getUniformLocation(program, "u_variant");
    const variantValue =
      variant === "silver"
        ? 1
        : variant === "dusk"
          ? 2
          : variant === "reference"
            ? 3
            : 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const loopSeconds = motion === "slow" ? SLOW_LOOP_SECONDS : NORMAL_LOOP_SECONDS;
    const frameInterval = 1000 / MAX_FPS;
    const start = performance.now();

    let animationFrame = 0;
    let lastPaint = -frameInterval;
    let needsResize = true;
    let isVisible = false;
    let pageIsVisible = !document.hidden;
    let contextLost = false;

    const shouldAnimate = () =>
      shouldAnimateMetallicField({
        motion,
        reducedMotion: reducedMotion.matches,
        inViewport: isVisible,
        pageVisible: pageIsVisible,
      });

    const resizeCanvas = () => {
      const dprCap = window.innerWidth < 768 ? 1 : 1.25;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      needsResize = false;
    };

    const paint = (now: number) => {
      if (contextLost) return;
      if (needsResize) resizeCanvas();

      const currentPhase = shouldAnimate()
        ? (((now - start) / 1000) % loopSeconds) * ((Math.PI * 2) / loopSeconds)
        : STATIC_PHASE;

      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(phase, currentPhase);
      gl.uniform1f(variantUniform, variantValue);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      lastPaint = now;
    };

    const schedule = () => {
      if (
        !animationFrame &&
        !contextLost &&
        shouldAnimate() &&
        isVisible &&
        pageIsVisible
      ) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    const render = (now: number) => {
      animationFrame = 0;

      if (now - lastPaint >= frameInterval) {
        paint(now);
      }

      schedule();
    };

    const stop = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };

    const renderStill = () => {
      stop();
      paint(performance.now());
    };

    const handleIntersection = (visible: boolean) => {
      isVisible = visible;

      if (!isVisible) {
        stop();
      } else if (shouldAnimate()) {
        schedule();
      } else {
        renderStill();
      }
    };

    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => handleIntersection(entry.isIntersecting),
            { threshold: 0.01 },
          );

    if (intersectionObserver) intersectionObserver.observe(canvas);
    else handleIntersection(true);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            needsResize = true;
            if (!shouldAnimate() && isVisible) renderStill();
          });
    resizeObserver?.observe(canvas);

    const handleWindowResize = () => {
      needsResize = true;
      if (!shouldAnimate() && isVisible) renderStill();
    };
    if (!resizeObserver) window.addEventListener("resize", handleWindowResize);

    const handleVisibility = () => {
      pageIsVisible = !document.hidden;

      if (!pageIsVisible) {
        stop();
      } else if (shouldAnimate() && isVisible) {
        schedule();
      } else if (isVisible) {
        renderStill();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleMotionPreference = () => {
      if (shouldAnimate()) {
        schedule();
      } else {
        renderStill();
      }
    };
    reducedMotion.addEventListener("change", handleMotionPreference);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      stop();
      applyFallback();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      stop();
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      canvas.removeEventListener("webglcontextlost", handleContextLost);

      if (!contextLost) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
      }
    };
  }, [motion, variant]);

  return (
    <canvas
      ref={canvasRef}
      className="metallic-field__canvas"
      aria-hidden="true"
    />
  );
}

export default function MetallicField({
  className = "",
  motion = "normal",
  variant = "graphite",
}: MetallicFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (typeof IntersectionObserver === "undefined") {
      const fallbackMount = window.setTimeout(() => setMounted(true), 0);
      return () => window.clearTimeout(fallbackMount);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setMounted((current) =>
          nextLazyMountState(current, entry.isIntersecting),
        );
        observer.disconnect();
      },
      { rootMargin: "0px", threshold: 0.01 },
    );
    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={`metallic-field ${className}`.trim()}
      style={{ background: metallicFallback(variant) }}
      data-metallic-mounted={mounted ? "true" : "false"}
      aria-hidden="true"
    >
      {mounted ? <MetallicCanvas motion={motion} variant={variant} /> : null}
    </div>
  );
}
