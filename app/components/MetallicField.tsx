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
      /* ── LE CYCLORAMA BLANC ─────────────────────────────────────────────
         La reference du 22/08 est une eclaboussure de chrome sur FOND BLANC.
         Ce n'est pas un detail de gout : un chrome ne montre que ce qu'il
         reflete, donc changer le decor change entierement la matiere. Sur
         fond noir il etait sombre avec des aretes claires ; sur cyclorama
         blanc il devient clair avec des CREUX sombres, ce qui est exactement
         la lecture de la reference.

         Aucun terme temporel : la periodicite de la boucle reste intacte. */
      float studio(vec3 direction) {
        float hauteur = direction.y;
        float azimut = atan(direction.z, direction.x);

        // Le fond est lumineux partout, un peu plus dense vers le bas.
        float valeur = mix(0.78, 1.34, smoothstep(-0.55, 0.55, hauteur));
        valeur = mix(valeur, 0.30, (1.0 - smoothstep(-0.80, -0.22, hauteur)) * 0.78);

        /* Quelques sources franches reparties en azimut. Elles ne servent
           plus a eclairer — le decor est deja clair — mais a poser des
           ECLATS, ces points presque purs qui disent que la surface est
           polie et non peinte. */
        float sources = sin(azimut * 3.0) * 0.5 + 0.5;
        valeur += smoothstep(0.88, 0.985, sources) * 0.62;

        /* Et deux barres sombres. Contre-intuitif mais indispensable : sur
           fond blanc, ce sont les REFLETS SOMBRES qui dessinent la forme.
           Sans eux la matiere se confond avec le fond et disparait. */
        float barres = sin(azimut * 2.0 + hauteur * 3.0) * 0.5 + 0.5;
        valeur -= smoothstep(0.72, 0.94, barres) * 0.74;
        valeur -= smoothstep(0.20, -0.30, hauteur) * 0.30;

        return clamp(valeur, 0.0, 1.8);
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

      /* ══ LE FLUIDE EN LANCER DE RAYONS ══════════════════════════════════
         Choix d'Adam du 22/08, apres deux tentatives ratees en champ de
         hauteur. Le diagnostic qui a conduit ici : un champ de hauteur
         ECLAIRE plafonne avant le niveau de la reference, quels que soient
         ses coefficients. Il ne sait produire ni une silhouette fermee, ni
         une goutte separee, ni le reflet du fluide sur lui-meme — trois
         choses qu'un rendu 3D donne d'office.

         Ce qui change vraiment : la matiere n'est plus dessinee, elle est
         RENCONTREE. Un rayon par pixel avance jusqu'a toucher la surface, on
         prend sa normale exacte, et on regarde ce que son reflet va chercher
         dans le studio. Une goutte detachee devient alors une vraie goutte,
         pas une tache claire.

         BUDGET. Le canevas est deja plafonne a 1,25 pixel physique et 30
         images par seconde. La marche primaire est bornee a 48 pas, le rebond
         a 18 : c'est ce qui tient ce budget. Le facteur 0,92 sur le pas evite
         de traverser la surface aux silhouettes rasantes sans multiplier les
         iterations.

         BOUCLAGE. Aucun nouveau coefficient fractionnaire sur la phase : les
         trajectoires n'emploient que des multiples ENTIERS de u_phase, donc
         exactement periodiques sur un tour, desynchronises par des decalages
         constants. */
      float unionDouce(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      /* ══ L'ECLABOUSSURE ═════════════════════════════════════════════════
         Troisieme construction, et la premiere qui vise la BONNE topologie.

         Ce que les deux precedentes rataient. Des spheres reunies donnent des
         renflements ; une ellipsoide coquee donne une bulle froissee. Or une
         eclaboussure n'est ni l'un ni l'autre : c'est une nappe qui part d'un
         point d'impact, se creuse en cuvette, se releve en COURONNE, et dont
         le bord se dechire en dents d'ou partent les gouttes. Sa geometrie est
         RADIALE et se decrit en coordonnees polaires, pas en sommes de
         volumes. C'est pour cela qu'aucun reglage des versions precedentes ne
         pouvait y mener.

         La nappe est donc definie par son PROFIL, une altitude en fonction du
         rayon et de l'azimut, puis transformee en peau d'epaisseur finie.

         Bouclage : uniquement des multiples entiers de u_phase. */
      float profilNappe(vec2 sol) {
        float t = u_phase;
        float rayon = length(sol);
        float azimut = atan(sol.y, sol.x);

        // LA CUVETTE. Au point d'impact la matiere s'enfonce.
        float cuvette = -0.86 * exp(-rayon * rayon * 1.55);

        /* LA COURONNE. Un bourrelet circulaire qui se releve a distance fixe
           de l'impact. Son rayon respire avec la phase : l'onde s'ecarte. */
        float rayonCouronne = 0.94 + sin(t) * 0.10;
        float bourrelet = exp(-(rayon - rayonCouronne) * (rayon - rayonCouronne) * 5.6);

        /* LES DENTS. Le bord d'une couronne ne monte pas d'un bloc : il se
           divise en lames inegales, et c'est de leur pointe que partent les
           gouttes. Deux harmoniques desynchronisees suffisent a rompre toute
           regularite mecanique. */
        float dents =
          (sin(azimut * 7.0 + t) * 0.5 + 0.5) * 0.86 +
          (sin(azimut * 13.0 - t) * 0.5 + 0.5) * 0.44 +
          (sin(azimut * 3.0 + t * 2.0) * 0.5 + 0.5) * 0.22;
        /* 2,35 et non 0,95. A la distance de camera retenue, une couronne
           d'un demi rayon de haut ne se lit plus : sa silhouette se confond
           avec la nappe et l'ensemble revient a une dune lisse, constate a
           l'ecran. C'est la SILHOUETTE qui porte cette image, donc elle doit
           depasser franchement. */
        float couronne = bourrelet * (0.30 + dents) * 2.35;

        /* LES ONDES. La nappe garde la memoire de l'impact : des rides
           concentriques qui s'amortissent en s'eloignant. */
        float ondes = sin(rayon * 6.4 - t * 2.0) * 0.075 * exp(-rayon * 0.85);

        // Un voile exterieur qui retombe, pour que la nappe ne s'arrete pas net.
        float voile = -0.20 * smoothstep(1.05, 1.70, rayon);

        return cuvette + couronne + ondes + voile;
      }

      /* La peau. La valeur absolue transforme le contour de la nappe en paroi de part et
         d'autre d'elle-meme ; le facteur 0,62 corrige le fait qu'une altitude
         n'est pas une distance, sans quoi la marche depasse la surface. */
      float carteFluide(vec3 pos) {
        float ecart = pos.y - profilNappe(pos.xz);
        float peau = abs(ecart) * 0.62 - 0.052;

        /* LA NAPPE EST BORNEE, ET C'EST INDISPENSABLE. Un profil defini pour
           tout le plan produit une nappe INFINIE : elle remplit le cadre, on
           ne voit jamais une sculpture posee dans du vide, et la reference
           devient inatteignable — constate a l'ecran le 22/08.

           L'intersection avec une sphere donne a l'eclaboussure un bord franc
           et du blanc autour. Elle divise aussi le cout par un facteur net :
           les rayons qui passent a cote sortent des les premiers pas au lieu
           de longer une nappe sans fin. */
        float borne = length(pos * vec3(0.80, 0.72, 0.80)) - 1.66;
        return max(peau, borne);
      }

      /* Les gouttes projetees, au-dessus des dents. Union franche : une goutte
         qui fusionne cesse d'etre une goutte. */
      float carteGouttes(vec3 pos) {
        float t = u_phase;
        float d = length(pos - vec3(0.92 + cos(t) * 0.08, 0.86 + sin(t * 2.0) * 0.14, 0.30)) - 0.048;
        d = min(d, length(pos - vec3(-0.78 + sin(t * 2.0) * 0.07, 1.02 + cos(t) * 0.16, -0.42)) - 0.038);
        d = min(d, length(pos - vec3(0.32 + cos(t * 2.0 + 2.0) * 0.06, 1.24 + sin(t) * 0.12, 0.62)) - 0.030);
        d = min(d, length(pos - vec3(-1.14 + sin(t * 3.0) * 0.06, 0.74 + cos(t * 2.0) * 0.13, 0.18)) - 0.026);
        d = min(d, length(pos - vec3(1.28 + cos(t * 3.0 + 1.0) * 0.05, 0.62 + sin(t * 2.0 + 1.0) * 0.11, -0.54)) - 0.022);
        d = min(d, length(pos - vec3(-0.24 + sin(t * 2.0 + 4.0) * 0.05, 1.42 + cos(t * 3.0) * 0.10, -0.16)) - 0.018);
        return d;
      }

      float carteScene(vec3 pos) {
        return min(carteFluide(pos), carteGouttes(pos));
      }

      vec3 normaleScene(vec3 pos) {
        vec2 e = vec2(0.0018, 0.0);
        return normalize(vec3(
          carteScene(pos + e.xyy) - carteScene(pos - e.xyy),
          carteScene(pos + e.yxy) - carteScene(pos - e.yxy),
          carteScene(pos + e.yyx) - carteScene(pos - e.yyx)
        ));
      }

      // Distance parcourue, et temoin de contact.
      vec2 marcher(vec3 origine, vec3 direction) {
        float distance = 0.0;
        float touche = 0.0;
        /* LA TOLERANCE S'OUVRE AVEC LA DISTANCE, ET C'EST LA CORRECTION DU
           PIQUETE. Constate a l'ecran le 22/08 : un mouchetage noir entourait
           les silhouettes, que j'ai d'abord pris pour un lisere de detourage
           avant de zoomer et de voir qu'il vient du METAL.

           Cause : un seuil de contact CONSTANT. Loin de la camera, un pixel
           couvre une portion de scene bien plus large ; exiger la meme
           precision qu'au premier plan fait manquer la surface un rayon sur
           deux aux incidences rasantes, et un rayon manque devient un point
           noir. Le voisin, lui, touche. D'ou le grain.

           On fait donc croitre le seuil avec la distance parcourue : chaque
           rayon exige une precision proportionnee a ce qu'il represente
           reellement a l'ecran. C'est le principe du cone de rayon, et il ne
           coute aucun pas supplementaire. */
        for (int i = 0; i < 56; i++) {
          float pas = carteScene(origine + direction * distance);
          if (pas < 0.0016 + distance * 0.0022) { touche = 1.0; break; }
          if (distance > 6.4) break;
          distance += pas * 0.55;
        }
        return vec2(distance, touche);
      }

      // Le rebond : le fluide se voit lui-meme. Moins de pas, c'est un detail.
      vec2 marcherRebond(vec3 origine, vec3 direction) {
        float distance = 0.03;
        float touche = 0.0;
        for (int i = 0; i < 14; i++) {
          float pas = carteScene(origine + direction * distance);
          if (pas < 0.0045) { touche = 1.0; break; }
          if (distance > 4.5) break;
          distance += pas * 0.58;
        }
        return vec2(distance, touche);
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

          /* ── LA SCENE EST RENCONTREE, PAS DESSINEE ────────────────────
             Un rayon par pixel. La camera est en retrait sur l'axe Z et
             regarde la nappe de fluide ; l'ouverture est large pour que les
             masses des bords entrent dans le champ. */
          /* La camera se place LEGEREMENT AU-DESSUS du plan d'impact et vise
             la cuvette : vue strictement de face, une couronne se lit comme un
             anneau plat et l'eclaboussure disparait. */
          vec3 origineRayon = vec3(0.0, 0.72, 4.35);
          vec3 vise = vec3(0.0, 0.18, 0.0);
          vec3 axeAvant = normalize(vise - origineRayon);
          vec3 axeDroite = normalize(cross(vec3(0.0, 1.0, 0.0), axeAvant));
          vec3 axeHaut = cross(axeAvant, axeDroite);
          vec3 directionRayon = normalize(
            axeAvant * 2.05 +
            axeDroite * scene.x * 2.32 +
            axeHaut * scene.y * 2.32
          );

          vec2 contact = marcher(origineRayon, directionRayon);
          vec3 pointContact = origineRayon + directionRayon * contact.x;
          vec3 normale = normaleScene(pointContact);
          vec3 refletPrincipal = reflect(directionRayon, normale);

          // Ce que le reflet va chercher dans le studio.
          float valeurStudio = studio(refletPrincipal);

          /* LE REBOND. Sans lui, deux masses voisines s'ignorent et la scene
             perd sa cohesion : c'est le fluide qui se voit lui-meme qui
             produit les entrelacs sombres de la reference. */
          vec2 rebond = marcherRebond(pointContact + normale * 0.012, refletPrincipal);
          vec3 pointRebond =
            pointContact + normale * 0.012 + refletPrincipal * rebond.x;
          vec3 normaleRebond = normaleScene(pointRebond);
          float valeurRebond = studio(reflect(refletPrincipal, normaleRebond));
          float valeur = mix(
            valeurStudio,
            mix(valeurStudio, valeurRebond, 0.70),
            rebond.y
          );

          /* FRESNEL. Sur un metal, les incidences rasantes s'eclaircissent
             franchement : c'est ce qui dessine le liseré lumineux tout autour
             de chaque masse, et sans lui les silhouettes restent molles. */
          float fresnel = pow(1.0 - max(0.0, dot(-directionRayon, normale)), 3.2);
          valeur += fresnel * 0.62;

          /* Une dispersion minuscule entre les trois canaux. Un chrome reel
             n'est jamais parfaitement neutre sur ses aretes. */
          vec3 couleurMatiere = vec3(
            studio(refletPrincipal + vec3(0.005, 0.004, 0.0)),
            valeur,
            studio(refletPrincipal - vec3(0.004, 0.003, 0.0))
          );
          /* 0.16 et non 0.42. A 0.42 l'ecart entre les trois echantillons
             tombait de part et d'autre d'une rampe du studio, et la difference
             devenait une FRANGE VERTE visible a l'ecran, releve le 22/08. Une
             dispersion de chrome doit rester a la limite du perceptible. */
          couleurMatiere = mix(vec3(valeur), couleurMatiere, 0.16);
          couleurMatiere += fresnel * 0.62;

          // Hors matiere : le studio vu directement, assombri, qui sert de fond.
          float fond = studio(directionRayon);

          vec3 referenceBase = mix(vec3(fond), couleurMatiere, contact.y);

          float referenceDepth = mix(
            0.16,
            clamp(1.0 - (contact.x - 2.0) * 0.42, 0.0, 1.0),
            contact.y
          );
          finalDepth = referenceDepth;

          /* Le contraste final. La reference oppose du blanc franc a du noir
             franc, sans plage grise intermediaire : la plage est donc etroite. */
          referenceBase = smoothstep(
            vec3(0.03),
            vec3(1.24),
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

          /* ── LA ZONE DES TETES ───────────────────────────────────────────
             C'est le seul endroit ou le bord de la decoupe rencontre le metal
             sur une matiere FINE : les cheveux. Partout ailleurs la silhouette
             est franche, epaule ou cuisse, et l'escalier de l'alpha ne se voit
             pas. Sur une meche, il se voit des que le fond est clair.

             Quatre tentatives de correction du detourage lui-meme ont echoue,
             toutes chiffrees le 22/08 : deux erosions, le modele portrait a
             resolution reduite, puis le meme par bandes a pleine resolution et
             sans couture. Le meilleur masque disponible est deja servi.

             Le defaut ne vient donc pas de la decoupe, il vient du CONTRASTE
             qui la revele. On assombrit le metal derriere les tetes, et le
             bord cesse d'etre lisible sans qu'un seul pixel du sujet change.

             La zone est large et sa transition longue : un assombrissement
             net creerait une tache, ce qui serait pire que le defaut. */
          float zoneTetes =
            smoothstep(0.60, 0.93, uv.y) *
            (1.0 - smoothstep(0.09, 0.44, abs(uv.x - 0.52)));
          referenceBase *= 1.0 - zoneTetes * 0.52;
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
