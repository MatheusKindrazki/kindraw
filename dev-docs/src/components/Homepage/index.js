import clsx from "clsx";
import React from "react";

import styles from "./styles.module.css";

const FeatureList = [
  {
    title: "Understand the Kindraw architecture",
    Svg: require("@site/static/img/undraw_innovative.svg").default,
    description: (
      <>Want to contribute to Kindraw without getting lost in the fork?</>
    ),
  },
  {
    title: "Embed the editor package",
    Svg: require("@site/static/img/undraw_blank_canvas.svg").default,
    description: (
      <>
        Need the editor package inside your own product and want the shortest
        path to integration?
      </>
    ),
  },
  {
    title: "Help us improve",
    Svg: require("@site/static/img/undraw_add_files.svg").default,
    description: (
      <>
        Are the docs missing something? Anything you had trouble understanding
        or needs an explanation? Come contribute to the docs to make them even
        better!
      </>
    ),
  },
];

function Feature({ Svg, title, description }) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
