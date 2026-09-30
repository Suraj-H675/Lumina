import type { Metadata } from "next";
import Link from "next/link";

import type { LabIndexMessages } from "../../lib/i18n/messages/types";
import styles from "./lab-page.module.css";

const labs = [
  {
    href: "/lab/orbit-sandbox",
    title: "Orbit Sandbox",
    description:
      "Explore reviewed Newtonian two-body motion, orbital elements, collisions, and numerical drift.",
  },
  {
    href: "/lab/transit-method",
    title: "Transit Method Lab",
    description:
      "Explore circular exoplanet transit geometry, contact durations, and a deterministic uniform-source light curve.",
  },
  {
    href: "/lab/radial-velocity",
    title: "Radial Velocity Lab",
    description:
      "Explore deterministic stellar reflex velocity, orbital inclination, and the spectroscopic minimum-mass degeneracy.",
  },
  {
    href: "/lab/stellar-laboratory",
    title: "Stellar Laboratory",
    description:
      "Explore a source-backed approximate main-sequence mass mapping, lifetime anchors, and broad stellar remnants.",
  },
  {
    href: "/lab/eclipse-simulator",
    title: "Eclipse Simulator",
    description:
      "Explore offline topocentric solar-eclipse geometry, approximate local contacts, and permanent viewing-safety guidance.",
  },
  {
    href: "/lab/spectroscopy-lab",
    title: "Spectroscopy Lab",
    description:
      "Explore a normalized visible teaching spectrum with source-backed atomic fingerprints, bounded Doppler shift, resolving power, and deterministic display noise.",
  },
  {
    href: "/lab/planetary-system-builder",
    title: "Planetary System Builder",
    description:
      "Build a circular non-interacting system and compare source-backed orbital periods, a conservative reference habitable-zone band, and limited pairwise mutual-Hill diagnostics.",
  },
  {
    href: "/lab/rocket-mission-designer",
    title: "Rocket / Mission Designer",
    description:
      "Explore an ideal staged-rocket teaching model with source-backed delta-v, surface-gravity TWR references, payload sensitivity, and explicitly non-operational velocity comparisons.",
  },
  {
    href: "/lab/impact-simulator",
    title: "Impact Simulator",
    description:
      "Explore a large solid-rock Earth-impact teaching model with cited crater scaling, explicit coefficient sensitivity, and location-free lower-bound ejecta deposit ranges.",
  },
  {
    href: "/lab/black-hole-relativity",
    title: "Black-Hole / Relativity Lab",
    description:
      "Explore Schwarzschild event-horizon, photon-sphere, ISCO, static-clock, and redshift relationships with an explicitly non-ray-traced teaching model.",
  },
  {
    href: "/lab/relativity-visualizations",
    title: "Relativity Visualizations",
    description:
      "Explore inertial-frame time dilation, length contraction, relativity of simultaneity, and reviewed light-cone teaching geometry.",
  },
  {
    href: "/lab/scale-explorer",
    title: "Scale Explorer",
    description: "Move through a cited logarithmic scale of astronomical characteristic sizes.",
  },
  {
    href: "/lab/seasons-simulator",
    title: "Seasons Simulator",
    description:
      "Explore idealized axial-tilt solar geometry and separate orbital-distance context.",
  },
  {
    href: "/lab/telescope-builder",
    title: "Telescope Builder",
    description:
      "Explore idealized visual telescope, eyepiece, focal-modifier, field, and exit-pupil geometry.",
  },
  {
    href: "/lab/hr-diagram-explorer",
    title: "H-R Diagram Explorer",
    description:
      "Explore a curated Gaia DR3 stellar sample across physical H-R and Gaia colour–magnitude views.",
  },
] as const;

export function createLabMetadata(messages: LabIndexMessages): Metadata {
  return {
    alternates: {
      canonical: "/lab",
    },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default function LabPage({ messages }: Readonly<{ messages: LabIndexMessages }>) {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>{messages.intro}</p>
      </header>

      <nav aria-label={messages.navigationLabel}>
        <ul className={styles.list}>
          {labs.map((lab, index) => (
            <li className={styles.item} key={lab.href}>
              <Link className={styles.link} href={lab.href}>
                <span aria-hidden="true" className={styles.index}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.content}>
                  <span className={styles.labTitle}>{lab.title}</span>
                  <span className={styles.description}>{lab.description}</span>
                  <span className={styles.openLabel}>{messages.openLab}</span>
                </span>
                <span aria-hidden="true" className={styles.arrow}>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
