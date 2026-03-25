import puter from "@heyputer/puter.js";
import {getOrCreateHostingConfig, uploadImageToHosting} from "./puter.hosting";
import {isHostedUrl} from "./utils";
import {PUTER_WORKER_URL} from "./constants";

export const signIn = async () => await puter.auth.signIn();

export const signOut = () => puter.auth.signOut();

export const getCurrentUser = async () => {
    try {
        return await puter.auth.getUser();
    } catch {
        return null;
    }
}

// Garante que o usuário está autenticado antes de qualquer operação
const ensureAuth = async (): Promise<boolean> => {
    try {
        if (!puter.auth.isSignedIn()) {
            console.log("-> Usuário não autenticado. Iniciando login...");
            await puter.auth.signIn();
        }
        return puter.auth.isSignedIn();
    } catch (e) {
        console.error("-> ERRO ao autenticar:", e);
        return false;
    }
};

export const createProject = async ({ item, visibility = "private" }: CreateProjectParams): Promise<DesignItem | null | undefined> => {
    
    console.log("--> INICIANDO createProject", item);

    if(!PUTER_WORKER_URL) {
        console.warn('-> ERRO: Missing VITE_PUTER_WORKER_URL');
        return null;
    }

    // CORREÇÃO: garante autenticação antes de qualquer chamada ao Puter
    const authenticated = await ensureAuth();
    if (!authenticated) {
        console.error("-> ERRO: Não foi possível autenticar o usuário.");
        return null;
    }

    const projectId = item.id;

    console.log("-> BUSCANDO hosting config...");
    const hosting = await getOrCreateHostingConfig();
    console.log("-> CONFIG RECEBIDA:", hosting);

    if (!hosting) {
        console.error("-> ERRO: Não foi possível obter/criar hosting config.");
        return null;
    }

    console.log("-> FAZENDO UPLOAD do source...");
    const hostedSource = projectId ?
        await uploadImageToHosting({ hosting, url: item.sourceImage, projectId, label: 'source', }) : null;
    console.log("-> RESULTADO hostedSource:", hostedSource);

    console.log("-> FAZENDO UPLOAD do render...");
    const hostedRender = projectId && item.renderedImage ?
        await uploadImageToHosting({ hosting, url: item.renderedImage, projectId, label: 'rendered', }) : null;
    console.log("-> RESULTADO hostedRender:", hostedRender);

    const resolvedSource = hostedSource?.url || (isHostedUrl(item.sourceImage)
        ? item.sourceImage
        : ''
    );

    if(!resolvedSource) {
        console.warn('-> ERRO: Failed to resolve source image. Valor:', resolvedSource);
        return null;
    }

    const resolvedRender = hostedRender?.url
        ? hostedRender?.url
        : item.renderedImage && isHostedUrl(item.renderedImage)
            ? item.renderedImage
            : undefined;

    const {
        sourcePath: _sourcePath,
        renderedPath: _renderedPath,
        publicPath: _publicPath,
        ...rest
    } = item;

    const payload = {
        ...rest,
        sourceImage: resolvedSource,
        renderedImage: resolvedRender,
    }

    try {
        console.log("-> ENVIANDO payload para o Worker:", PUTER_WORKER_URL, payload);
        const response = await puter.workers.exec(`${PUTER_WORKER_URL}/api/projects/save`, {
            method: 'POST',
            body: JSON.stringify({
                project: payload,
                visibility
            })
        });

        if(!response.ok) {
            console.error('-> ERRO NO WORKER: response.ok is false', await response.text());
            return null;
        }

        const data = (await response.json()) as { project?: DesignItem | null }
        console.log("-> SUCESSO! Data recebida do Worker:", data);

        return data?.project ?? null;
    } catch (e) {
        console.error('-> ERRO CATCH FINAL: Failed to save project', e)
        return null;
    }
}

export const getProjects = async () => {
    if(!PUTER_WORKER_URL) {
        console.warn('Missing VITE_PUTER_WORKER_URL; skip history fetch;');
        return []
    }

    const authenticated = await ensureAuth();
    if (!authenticated) return [];

    try {
        const response = await puter.workers.exec(`${PUTER_WORKER_URL}/api/projects/list`, { method: 'GET' });

        if(!response.ok) {
            console.error('Failed to fetch history', await response.text());
            return [];
        }

        const data = (await response.json()) as { projects?: DesignItem[] | null };

        return Array.isArray(data?.projects) ? data?.projects : [];
    } catch (e) {
        console.error('Failed to get projects', e);
        return [];
    }
}

export const getProjectById = async ({ id }: { id: string }) => {
    if (!PUTER_WORKER_URL) {
        console.warn("Missing VITE_PUTER_WORKER_URL; skipping project fetch.");
        return null;
    }

    const authenticated = await ensureAuth();
    if (!authenticated) return null;

    console.log("Fetching project with ID:", id);

    try {
        const response = await puter.workers.exec(
            `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
            { method: "GET" },
        );

        if (!response.ok) {
            console.error("Failed to fetch project:", await response.text());
            return null;
        }

        const data = (await response.json()) as {
            project?: DesignItem | null;
        };

        return data?.project ?? null;
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return null;
    }
};