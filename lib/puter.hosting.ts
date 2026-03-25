import puter from "@heyputer/puter.js";
import {
    createHostingSlug,
    fetchBlobFromUrl, getHostedUrl,
    getImageExtension,
    HOSTING_CONFIG_KEY,
    imageUrlToPngBlob,
    isHostedUrl
} from "./utils";

export const getOrCreateHostingConfig = async (): Promise<HostingConfig | null> => {
    try {
        const existing = (await puter.kv.get(HOSTING_CONFIG_KEY)) as HostingConfig | null;

        if (existing?.subdomain) return { subdomain: existing.subdomain };

        const subdomain = createHostingSlug();

        const created = await puter.hosting.create(subdomain, '.');

        const record = { subdomain: created.subdomain };

        await puter.kv.set(HOSTING_CONFIG_KEY, record);

        return record;
    } catch (e) {
        console.error("Erro em getOrCreateHostingConfig:", e);
        return null;
    }
};

// CORREÇÃO: cria pastas recursivamente sem depender de createMissingParents,
// que não existe na API atual do Puter.
const ensureDirRecursive = async (path: string): Promise<void> => {
    const parts = path.split('/').filter(Boolean);
    let current = '';

    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        try {
            await puter.fs.mkdir(current);
        } catch (e: any) {
            // "path_exists" ou "already_exists" são seguros de ignorar
            if (e?.code !== 'path_exists' && e?.code !== 'already_exists') {
                // Para qualquer outro erro, loga mas continua tentando —
                // o write seguinte vai confirmar se o caminho está ok.
                console.warn(`Aviso ao criar pasta "${current}":`, e?.code ?? e);
            }
        }
    }
};

export const uploadImageToHosting = async ({
  hosting,
  url,
  projectId,
  label
}: StoreHostedImageParams): Promise<HostedAsset | null> => {

    if (!hosting || !url) return null;
    if (isHostedUrl(url)) return { url };

    try {
        // 1. Transforma a imagem
        const resolved = label === "rendered"
            ? await imageUrlToPngBlob(url)
                .then((blob) => blob ? { blob, contentType: 'image/png' } : null)
            : await fetchBlobFromUrl(url);

        if (!resolved) return null;

        const contentType = resolved.contentType || resolved.blob?.type || '';
        const ext = getImageExtension(contentType, url);
        const fileName = `${label}-${projectId}.${ext}`;

        // CORREÇÃO: pasta relativa à raiz do usuário no Puter FS.
        // O hosting foi criado apontando para '.', que mapeia para a raiz do app.
        // Mantemos o mesmo caminho relativo tanto no FS quanto na URL gerada.
        const dir = `projects/${projectId}`;
        const filePath = `${dir}/${fileName}`;

        const uploadFile = new File([resolved.blob], fileName, {
            type: contentType,
        });

        // CORREÇÃO: criação recursiva das pastas sem usar createMissingParents
        await ensureDirRecursive(dir);

        // Grava o arquivo (overwrite = true evita erro se já existir)
        await puter.fs.write(filePath, uploadFile, { overwrite: true });

        // Gera a URL pública
        const hostedUrl = getHostedUrl(
            { subdomain: hosting.subdomain },
            filePath
        );

        return hostedUrl ? { url: hostedUrl } : null;

    } catch (e) {
        console.error("ERRO FATAL EM uploadImageToHosting:", e);
        return null;
    }
};