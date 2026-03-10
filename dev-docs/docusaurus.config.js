// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

// Set the env variable to false so the excalidraw npm package doesn't throw
// process undefined as docusaurus doesn't expose env variables by default

process.env.IS_PREACT = "false";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Kindraw developer docs",
  tagline: "For Kindraw contributors and teams embedding the editor package",
  url: "https://kindraw.dev",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.png",
  organizationName: "MatheusKindrazki",
  projectName: "kindraw",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          // Please change this to your repo.
          editUrl:
            "https://github.com/MatheusKindrazki/kindraw/tree/master/dev-docs/",
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        theme: {
          customCss: [require.resolve("./src/css/custom.scss")],
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: "Kindraw",
        logo: {
          alt: "Kindraw Logo",
          src: "img/logo.svg",
        },
        items: [
          {
            to: "/docs",
            position: "left",
            label: "Docs",
          },
          {
            to: "https://kindraw.dev",
            label: "Website",
            position: "left",
          },
          {
            to: "https://github.com/MatheusKindrazki/kindraw",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Get Started",
                to: "/docs",
              },
            ],
          },
          {
            title: "Project",
            items: [
              {
                label: "Website",
                href: "https://kindraw.dev",
              },
              {
                label: "API",
                href: "https://api.kindraw.dev",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "GitHub",
                to: "https://github.com/MatheusKindrazki/kindraw",
              },
            ],
          },
        ],
        copyright: `Copyright © 2026 Kindraw. Built with Docusaurus.`,
      },
      prism: {
        theme: require("prism-react-renderer/themes/dracula"),
      },
      image: "img/og-image-2.png",
      docs: {
        sidebar: {
          hideable: true,
        },
      },
      tableOfContents: {
        maxHeadingLevel: 4,
      },
    }),
  themes: ["@docusaurus/theme-live-codeblock"],
  plugins: [
    "docusaurus-plugin-sass",
    [
      "docusaurus2-dotenv",
      {
        systemvars: true,
      },
    ],
    function () {
      return {
        name: "disable-fully-specified-error",
        configureWebpack() {
          return {
            module: {
              rules: [
                {
                  test: /\.m?js$/,
                  resolve: {
                    fullySpecified: false,
                  },
                },
              ],
            },
            optimization: {
              // disable terser minification
              minimize: false,
            },
          };
        },
      };
    },
  ],
};

module.exports = config;
