import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader"; // Mantido caso queira reativar no futuro
import { selectEl, downloadBlob, sleep, selectEls, loadTranslationLanguage, translate, getStackTrace, random, UserError, joinOr, conditionallyGroup, groupByFileExtension, addFilesToFileInput, setFileInputFiles, dispatchInputEvents, removeFileExtension } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js"; // Este é o seu HoloPrint.js modificado
// import SupabaseLogger from "./SupabaseLogger.js"; // Removido

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js"; // Necessário para o preview de textura
// import ItemCriteriaInput from "./components/ItemCriteriaInput.js"; // Não usado diretamente nesta UI simplificada
import FileInputTable from "./components/FileInputTable.js";
import SimpleLogger from "./components/SimpleLogger.js";

const IN_PRODUCTION = false; // Mantenha false para desenvolvimento
const ACTUAL_CONSOLE_LOG = false; // Use true para ver logs no console do navegador em vez do logger customizado

// Constantes de telemetria removidas

window.OffscreenCanvas ?? class OffscreenCanvas {
	constructor(w, h) {
		console.debug("Using OffscreenCanvas polyfill");
		this.canvas = document.createElement("canvas");
		this.canvas.width = w;
		this.canvas.height = h;
		this.canvas.convertToBlob = () => {
			return new Promise((res, rej) => {
				this.canvas.toBlob(blob => {
					if(blob) {
						res(blob);
					} else {
						rej();
					}
				});
			});
		};
		return this.canvas;
	}
};

let dropFileNotice;

/** @type {HTMLFormElement} */
let generatePackForm;
let generatePackFormSubmitButton;
/** @type {HTMLInputElement} */
let structureFilesInput;
/** @type {FileInputTable} */
let structureFilesTable;

let packNameInput;
let completedPacksCont;
let logger; // Para o SimpleLogger
let errorLogContainer; // Para a nova seção de erros

let languageSelector;
let defaultResourcePackStackPromise;

// Elementos da nova UI
let dropZoneStructure;
let texturePreviewImageCont;
let texturePreviewName;
let texturePreviewLoader;


document.addEventListener("DOMContentLoaded", () => {
	// Seletores para nova UI
	dropFileNotice = selectEl("#dropFileNotice");
	generatePackForm = selectEl("#generatePackForm");
	structureFilesInput = selectEl("#structureFilesInput");
    dropZoneStructure = selectEl("#dropZoneStructure");
	structureFilesTable = selectEl("#structureFilesTable");
    texturePreviewImageCont = selectEl("#texturePreviewImageCont");
    texturePreviewName = selectEl("#texturePreviewName");
    texturePreviewLoader = texturePreviewImageCont.querySelector(".loader");


	packNameInput = generatePackForm.elements.namedItem("packName"); // Pode ser de "Opções Avançadas"
	completedPacksCont = selectEl("#completedPacksCont");
	errorLogContainer = selectEl("#errorLogContainer"); // Nova área de log

	if(!ACTUAL_CONSOLE_LOG) {
		logger = document.createElement("simple-logger"); // Criar dinamicamente
        if (errorLogContainer) { // Anexar ao novo container se ele existir
            errorLogContainer.innerHTML = ''; // Limpar mensagem padrão
            errorLogContainer.appendChild(logger);
        } else { // Fallback para o corpo se o container não for encontrado
            document.body.appendChild(logger);
        }
		logger.patchConsoleMethods();
	}
    
    // Inicializa a file-input-table com o input correto
    if (structureFilesTable && structureFilesInput) {
        structureFilesTable.fileInput = structureFilesInput;
        // A file-input-table deve ouvir o evento 'input' do seu fileInput internamente
    }

	packNameInput?.addEventListener("invalid", () => { // Adicionado '?' para segurança
		packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error"));
	});
	packNameInput?.addEventListener("input", () => {
		packNameInput.setCustomValidity("");
	});

    setupStructureFileHandling(); // Configura drag & drop e input para .mcstructure

	structureFilesInput.addEventListener("input", () => {
        updatePackNameInputPlaceholder();
        updateTexturePreview(); // Tentar atualizar o preview ao selecionar arquivos
    });
    updatePackNameInputPlaceholder(); // Chamar inicialmente

	defaultResourcePackStackPromise = new ResourcePackStack();
	
	if(location.search == "?loadFile") { // Para PWA
		window.launchQueue?.setConsumer(async launchParams => {
			let launchFiles = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
			handleDroppedFiles(launchFiles); // Função para lidar com arquivos soltos
		});
	}
	
	generatePackForm.addEventListener("submit", async e => {
		e.preventDefault();
		
		let formData = new FormData(generatePackForm);
		let localResourcePacks = []; // Lógica de RP local mantida, mas não há input para isso na nova UI
		// let localResourcePackFiles = generatePackForm.elements.namedItem("localResourcePack")?.files;
		// if(localResourcePackFiles?.length) {
		// 	resourcePacks.push(await new LocalResourcePack(localResourcePackFiles));
		// }
		makePackAndHandleUI(formData.getAll("structureFiles"), localResourcePacks);
	});

    // Inicializar opções de textura (se movidas do HoloPrint.js para cá)
	generatePackForm.addEventListener("input", e => {
		// Se houver opções interativas que afetam o preview da textura, adicione a lógica aqui
        // Por exemplo, se o TextureAtlas original tinha um preview dinâmico:
		// if(e.target.closest("#hologram-options-section") && e.target.hasAttribute("name")) {
		// 	updateDynamicTexturePreviewBasedOnOptions(); // Função a ser criada
		// }
	});
	
	generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");
	
	// Configuração do seletor de idiomas
    languageSelector = selectEl("#languageSelector");
	setupLanguageSelector();
});

function setupStructureFileHandling() {
    if (!dropZoneStructure || !structureFilesInput) return;

    dropZoneStructure.addEventListener("click", () => structureFilesInput.click());

    dropZoneStructure.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZoneStructure.classList.add("dragover");
        showDropNotice(true);
    });

    dropZoneStructure.addEventListener("dragleave", () => {
        dropZoneStructure.classList.remove("dragover");
    });

    dropZoneStructure.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZoneStructure.classList.remove("dragover");
        showDropNotice(false);
        if (e.dataTransfer.files.length) {
            const mcstructureFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".mcstructure"));
            if (mcstructureFiles.length > 0) {
                const dt = new DataTransfer();
                mcstructureFiles.forEach(f => dt.items.add(f));
                structureFilesInput.files = dt.files;
                dispatchInputEvents(structureFilesInput); // Disparar evento para file-input-table
            } else {
                alert("Please drop .mcstructure files only."); // Melhorar com tradução
            }
        }
    });

     // Eventos globais para o aviso de arrastar e soltar
    let dragCounter = 0;
	document.documentElement.addEventListener("dragenter", (e) => {
        if (e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            showDropNotice(true);
        }
    });
	document.documentElement.addEventListener("dragleave", (e) => {
        if (!document.documentElement.contains(e.relatedTarget as Node)) { // Checa se o mouse saiu da janela
            dragCounter--;
            if (dragCounter === 0) {
                showDropNotice(false);
            }
        }
    });
    document.documentElement.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("Files")) {
             e.preventDefault();
             showDropNotice(true);
        }
    });
    document.documentElement.addEventListener("drop", (e) => { 
        e.preventDefault();
        dragCounter = 0;
        showDropNotice(false);
        // Se o drop for fora da dropZoneStructure, podemos optar por ignorar ou tentar processar
        // Por simplicidade, vamos assumir que o drop principal é na dropZoneStructure.
    });
}


function showDropNotice(show) {
    if (dropFileNotice) {
        dropFileNotice.classList.toggle("hidden", !show);
    }
}


function handleDroppedFiles(files) { // Para PWA e drops gerais
    const mcstructureFiles = files.filter(file => file.name.endsWith(".mcstructure"));
    if (mcstructureFiles.length > 0) {
        addFilesToFileInput(structureFilesInput, mcstructureFiles); // Adiciona aos já existentes
    } else {
        // Poderia mostrar um erro mais amigável
        console.warn("No .mcstructure files found in dropped items.");
    }
}

function updatePackNameInputPlaceholder() {
	if (packNameInput) {
        packNameInput.placeholder = HoloPrint.getDefaultPackName([...structureFilesInput.files]);
    }
}

async function updateTexturePreview() {
    if (!texturePreviewImageCont || !texturePreviewName || !structureFilesInput.files.length) {
        if(texturePreviewName) texturePreviewName.textContent = translateCurrentLanguage("preview.no_file_selected") || "No file selected";
        if(texturePreviewImageCont) texturePreviewImageCont.innerHTML = `<div class="loader hidden"></div><p id="texturePreviewName" data-translate="preview.no_file_selected">${texturePreviewName.textContent}</p>`; // Reset
        return;
    }

    const file = structureFilesInput.files[0]; // Preview da primeira estrutura por enquanto
    texturePreviewName.textContent = removeFileExtension(file.name);
    if(texturePreviewLoader) texturePreviewLoader.classList.remove("hidden");
    texturePreviewImageCont.querySelectorAll("img, canvas").forEach(el => el.remove());


    try {
        // Lógica simplificada para preview: Idealmente, usaríamos o TextureAtlas
        // para extrair uma textura representativa. Por ora, um placeholder.
        // No futuro, você precisaria de uma função no HoloPrint.js ou TextureAtlas.js
        // para gerar uma imagem de preview da textura principal da estrutura.
        // Ex: const previewBlob = await HoloPrint.generateStructureTexturePreview(file);
        // const imageUrl = URL.createObjectURL(previewBlob);
        
        // Placeholder:
        console.warn("Texture preview generation logic is a placeholder.");
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
        const placeholderText = document.createElement("p");
        placeholderText.textContent = `Preview for ${file.name} (Not Implemented Yet)`;
        placeholderText.style.color = "var(--secondary-text-color)";
        texturePreviewImageCont.appendChild(placeholderText);

    } catch (error) {
        console.error("Error generating texture preview:", error);
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
        texturePreviewName.textContent = "Error loading preview";
    }
}


async function setupLanguageSelector() {
    if (!languageSelector) return;
    try {
        const response = await fetch("translations/languages.json");
        if (!response.ok) throw new Error(`Failed to load languages.json: ${response.status}`);
        const languagesAndNames = await response.json();
        
        const sortedLanguages = Object.entries(languagesAndNames).sort((a, b) => a[1].localeCompare(b[1]));
        
        if (sortedLanguages.length <= 1) {
            languageSelector.parentElement.classList.add("hidden"); 
            await translatePage(sortedLanguages[0]?.[0] || "en_US");
            return;
        }

        let browserLang = navigator.language || navigator.userLanguage || "en_US"; 
        let defaultLanguage = sortedLanguages.find(([code]) => code.replace("_", "-").toLowerCase() === browserLang.toLowerCase())?.[0] ||
                              sortedLanguages.find(([code]) => code.split(/[-_]/)[0].toLowerCase() === browserLang.split(/[-_]/)[0].toLowerCase())?.[0] ||
                              "en_US";

        languageSelector.innerHTML = ''; 
        sortedLanguages.forEach(([code, name]) => {
            const option = new Option(name, code);
            languageSelector.add(option);
        });
        
        languageSelector.value = defaultLanguage; 
        await translatePage(defaultLanguage); 

        languageSelector.addEventListener("change", async (event) => {
            await translatePage(event.target.value);
        });

    } catch (error) {
        console.error("Error setting up language selector:", error);
        await translatePage("en_US");
        if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
    }
}

async function translatePage(languageCode) {
    await loadTranslationLanguage(languageCode); 

    const elements = document.querySelectorAll("[data-translate]");
    elements.forEach(element => {
        const key = element.dataset.translate;
        const translation = translate(key, languageCode); 
        if (translation !== undefined) {
            let finalTranslation = translation;
            const authorSub = element.dataset.translationSubAuthor;
            const versionSub = element.dataset.translationSubVersion || HOLOLAB_APP_VERSION;

            if (authorSub) {
                finalTranslation = finalTranslation.replace("{AUTHOR}", authorSub);
            }
            if (versionSub) {
                finalTranslation = finalTranslation.replace("{VERSION}", versionSub);
            }
            
            if (element.hasAttribute('data-translate-placeholder')) {
                 element.placeholder = finalTranslation;
            } else if (element.hasAttribute('data-translate-title')) {
                 element.title = finalTranslation;
            } else {
                element.innerHTML = finalTranslation; 
            }
        } else {
            console.warn(`Missing translation for key "${key}" in language "${languageCode}".`);
        }
    });
    document.documentElement.lang = languageCode.split("_")[0];
}

function translateCurrentLanguage(translationKey) {
	if(!languageSelector) {
		return undefined;
	}
	let translation = translate(translationKey, languageSelector.value);
	if(!translation) {
		translation = translate(translationKey, "en_US"); // Fallback para Inglês
		if(translation) {
			console.warn(`Couldn't find translation for ${translationKey} for language ${languageSelector.value}! Using English fallback.`);
		} else {
			console.warn(`Couldn't find translation for ${translationKey} for language ${languageSelector.value} or English!`);
			translation = translationKey; // Retorna a chave se nenhuma tradução for encontrada
		}
	}
	return translation;
}

/**
 * @param {Array<File>} files
 * @param {Array<LocalResourcePack>} localResourcePacks
 * @returns {Promise<void>}
 */
async function makePackAndHandleUI(files, localResourcePacks) {
	generatePackFormSubmitButton.disabled = true;
	
	let formData = new FormData(generatePackForm);
	let authors = formData.get("author")?.split(",").map(x => x.trim()).filter(Boolean) ?? []; // Adicionado ?. e filter(Boolean)
	
	/** @type {import("./HoloPrint.js").HoloPrintConfig} */
	let config = {
		IGNORED_BLOCKS: formData.get("ignoredBlocks")?.split(/\W/).filter(Boolean) ?? HoloPrint.IGNORED_BLOCKS,
		SCALE: formData.get("scale") ? parseFloat(formData.get("scale")) / 100 : 0.95,
		TINT_COLOR: formData.get("tintColor") || "#579EFA",
		TINT_OPACITY: formData.get("tintOpacity") ? parseFloat(formData.get("tintOpacity")) / 100 : 0.2,
        TEXTURE_OUTLINE_WIDTH: formData.get("textureOutlineWidth") ? parseFloat(formData.get("textureOutlineWidth")) : 0.25,
        TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor") || "#0000FF",
        TEXTURE_OUTLINE_OPACITY: formData.get("textureOutlineOpacity") ? parseFloat(formData.get("textureOutlineOpacity")) / 100 : 0.65,
		SPAWN_ANIMATION_ENABLED: !!formData.get("spawnAnimationEnabled"),
		PLAYER_CONTROLS_ENABLED: !!formData.get("playerControlsEnabled"),
		MATERIAL_LIST_ENABLED: !!formData.get("materialListEnabled"),
		// Opções do HoloPrint original que podem não ter input direto na nova UI, usar defaults:
        OPACITY: 0.9, // Default se não houver input
        MULTIPLE_OPACITIES: true, // Default
        MINI_SCALE: 0.125, // Default
        SPAWN_ANIMATION_LENGTH: 0.4, // Default
        RETEXTURE_CONTROL_ITEMS: false, // Default como definido em HoloPrint.js
        CONTROL_ITEM_TEXTURE_SCALE: 1, // Default
        RENAME_CONTROL_ITEMS: true, // Default
        WRONG_BLOCK_OVERLAY_COLOR: [1, 0, 0, 0.3], // Default
        INITIAL_OFFSET: [
            formData.get("initialOffsetX") ? parseInt(formData.get("initialOffsetX")) : 0,
            formData.get("initialOffsetY") ? parseInt(formData.get("initialOffsetY")) : 0,
            formData.get("initialOffsetZ") ? parseInt(formData.get("initialOffsetZ")) : 0
        ],
        BACKUP_SLOT_COUNT: 10, // Default
		PACK_NAME: formData.get("packName") || undefined,
		PACK_ICON_BLOB: undefined, // Ícone fixo é tratado em HoloPrint.js
		AUTHORS: authors,
		DESCRIPTION: formData.get("description") || undefined, // Se houver campo de descrição no form
		COMPRESSION_LEVEL: 5, // Default
        PREVIEW_BLOCK_LIMIT: 0, // Desabilitar preview do HoloPrint nesta UI por enquanto
        SHOW_PREVIEW_SKYBOX: false, // Desabilitar
        // Adicionar CONTROLS se houver inputs para eles
        CONTROLS: HoloPrint.DEFAULT_PLAYER_CONTROLS, // Usar defaults por enquanto
        IGNORED_MATERIAL_LIST_BLOCKS: [] // Default
	};
	
	let previewCont = document.createElement("div"); // Placeholder se o preview do HoloPrint fosse usado
	previewCont.classList.add("previewCont"); // Manter consistência

    // Limpar área de botões de download antigos
    if (completedPacksCont) completedPacksCont.innerHTML = '';

	let infoButton = document.createElement("button");
	infoButton.classList.add("packInfoButton"); 
	infoButton.dataset.translate = "progress.generating";
    translatePage(languageSelector.value); // Para traduzir o botão imediatamente
	completedPacksCont.prepend(infoButton);
	
	let resourcePackStack = await defaultResourcePackStackPromise; // Usar o default global
    if (localResourcePacks && localResourcePacks.length > 0) {
        resourcePackStack = await new ResourcePackStack(localResourcePacks);
    }
	
	let pack;
	logger?.setOriginTime(performance.now());
	
	let generationFailedError;
	if(ACTUAL_CONSOLE_LOG) {
		pack = await HoloPrint.makePack(files, config, resourcePackStack, null /* previewCont desabilitado */);
	} else {
		try {
			pack = await HoloPrint.makePack(files, config, resourcePackStack, null /* previewCont desabilitado */);
		} catch(e) {
			console.error(`Pack creation failed!\n${e}`);
			if(!(e instanceof UserError)) {
				generationFailedError = e;
			}
			if(!(e instanceof DOMException)) { 
				console.debug(getStackTrace(e).join("\n"));
			}
		}
	}
	
	infoButton.classList.add("finished");
	if(pack) {
		infoButton.dataset.translate = "button.download_pack"; // Usar chave de tradução
        translatePage(languageSelector.value); // Traduzir o botão
		infoButton.classList.add("completed");
		infoButton.onclick = () => {
			downloadBlob(pack, pack.name);
		};
	} else {
		if(generationFailedError) {
			let bugReportAnchor = document.createElement("a");
			bugReportAnchor.classList.add("buttonlike", "packInfoButton", "reportIssue");
			bugReportAnchor.href = `https://github.com/Holo-Lab/holo/issues/new?template=1-pack-creation-error.yml&title=Pack creation error: ${encodeURIComponent(generationFailedError.toString().replaceAll("\n", " "))}&version=${HoloPrint.VERSION}&logs=${encodeURIComponent(logger?.allLogs ? JSON.stringify(logger.allLogs) : "[]")}`;
			bugReportAnchor.target = "_blank";
			bugReportAnchor.dataset.translate = "pack_generation_failed.report_github_issue";
			infoButton.parentNode.replaceChild(bugReportAnchor, infoButton);
            translatePage(languageSelector.value); // Traduzir o novo botão
		} else {
			infoButton.classList.add("failed");
			infoButton.dataset.translate = "pack_generation_failed";
            translatePage(languageSelector.value); // Traduzir o botão
		}
	}
	
	generatePackFormSubmitButton.disabled = false;
}
