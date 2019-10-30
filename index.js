const cli = require("cli");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const https = require("https");

let page = null;

cli.parse({
  courseUrl: ["u", "Course url on coursehunter.net", "string", ""],
  outDir: ["o", "Absolute path to destination directory", "string", "."],
  login: ["l", "Login", "string", ""],
  password: ["p", "Password", "string", ""]
});

cli.main(async function(args, options) {
  if (
    !options.courseUrl ||
    !options.login ||
    !options.password ||
    !(options.outDir !== "." && path.isAbsolute(options.outDir))
  )
    return console.error("Invalid param(s)");

  const browser = await puppeteer.launch({
    defaultViewport: null,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  page = await browser.newPage();
  await page.goto("https://coursehunter.net/sign-in");
  await login(options.login, options.password);
  await page.goto(options.courseUrl);

  const leassonsListSelector = "#lessons-list";

  const leassonsListHandle = await page.$(leassonsListSelector);
  const { leassonsCount, baseUrl } = await leassonsListHandle.$$eval(
    "li",
    nodes => {
      const leassonsCount = nodes.length;
      const leassonUrl = nodes[0]
        .querySelector(`li>link[itemprop='url']`)
        .getAttribute("href");
      const baseUrl = leassonUrl.slice(0, leassonUrl.lastIndexOf("/") + 1);
      return { leassonsCount, baseUrl };
    }
  );

  const leassonsUrls = [];
  for (let i = 1; i < leassonsCount; i++) leassonsUrls.push(`lesson${i}.mp4`);

  console.log("Start downloading...");
  await Promise.all(
    leassonsUrls.map(leasson => {
      const leassonUrl = baseUrl + leasson;
      return download({
        leassonUrl,
        leassonName: leasson,
        destinationDir: options.outDir
      }).then(console.info);
    })
  );

  console.log("Course successful downloaded!");
});

function login(login, password) {
  const loginField = "body > div > div > form > div:nth-child(1) > input";
  const passwordField = "body > div > div > form > div:nth-child(2) > input";
  const signInBtn = "body > div > div > form > div.btn-group > button";
  return page
    .waitFor(loginField)
    .then(() => page.click(loginField))
    .then(() => page.keyboard.type(login))
    .then(() => page.click(passwordField))
    .then(() => page.keyboard.type(password))
    .then(() => page.click(signInBtn));
}

function download({ leassonUrl, leassonName, destinationDir }) {
  return new Promise((resolve, reject) =>
    https.get(leassonUrl, response => {
      const leassonPath = path.join(destinationDir, leassonName);
      const file = fs.createWriteStream(leassonPath);
      response
        .on("error", () =>
          fs.unlink(leassonPath, () =>
            resolve(
              `Something went wrong when downloading ${leassonName}. File deleted from disk.`
            )
          )
        )
        .pipe(file)
        .on("error", () =>
          fs.unlink(leassonPath, () =>
            resolve(
              `Something went wrong when save ${leassonName}. File deleted from disk.`
            )
          )
        );
      response.on("end", () =>
        resolve(`${leassonName} successfull downloaded.`)
      );
    })
  );
}
