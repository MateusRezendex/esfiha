(function () {
    const VISITOR_KEY = 'sqv_visitor_id';
    const SESSION_KEY = 'sqv_analytics_session';
    const ATTR_KEY = 'sqv_analytics_attribution';
    const SESSION_TIMEOUT = 30 * 60 * 1000;

    function uuid(prefix) {
        const id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return `${prefix}_${id}`;
    }

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) { /* ignore */ }
    }

    function getEndpoint() {
        if (window.SQV_ANALYTICS_ENDPOINT) return window.SQV_ANALYTICS_ENDPOINT;
        const meta = document.querySelector('meta[name="sqv-analytics-endpoint"]');
        if (meta && meta.content) return meta.content;
        if (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            return '';
        }
        return '';
    }

    function getVisitorId() {
        let id = storageGet(VISITOR_KEY);
        if (!id) {
            id = uuid('vis');
            storageSet(VISITOR_KEY, id);
        }
        return id;
    }

    function normalizeSource(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9_-]/g, '');
    }

    function inferSource(referrer) {
        const host = String(referrer || '').toLowerCase();
        if (!host) return 'direto';
        if (host.includes('instagram.')) return 'instagram';
        if (host.includes('facebook.') || host.includes('fb.')) return 'facebook';
        if (host.includes('google.')) return 'google';
        if (host.includes('wa.me') || host.includes('whatsapp.')) return 'whatsapp';
        return 'referencia';
    }

    function readAttribution() {
        const params = new URLSearchParams(location.search);
        const current = {
            source: normalizeSource(params.get('utm_source') || params.get('origem') || ''),
            medium: normalizeSource(params.get('utm_medium') || ''),
            campaign: normalizeSource(params.get('utm_campaign') || params.get('destino') || ''),
            content: normalizeSource(params.get('utm_content') || params.get('posicionamento') || ''),
            referrer: document.referrer || '',
            landingPage: `${location.pathname}${location.search}${location.hash}`,
        };

        if (!current.source) current.source = inferSource(current.referrer);

        let saved = null;
        try { saved = JSON.parse(storageGet(ATTR_KEY) || 'null'); } catch (_) { saved = null; }

        if (!saved || current.source !== 'direto' || current.campaign || current.content) {
            saved = { ...current, firstSeenAt: new Date().toISOString() };
            storageSet(ATTR_KEY, JSON.stringify(saved));
        }

        return {
            source: current.source && current.source !== 'direto' ? current.source : saved.source,
            medium: current.medium || saved.medium || '',
            campaign: current.campaign || saved.campaign || '',
            content: current.content || saved.content || '',
            referrer: current.referrer || saved.referrer || '',
            landingPage: saved.landingPage || current.landingPage,
            firstSource: saved.source,
        };
    }

    function getSession() {
        const now = Date.now();
        let current = null;
        try { current = JSON.parse(storageGet(SESSION_KEY) || 'null'); } catch (_) { current = null; }

        if (current && current.id && now - Number(current.lastActivity || 0) < SESSION_TIMEOUT) {
            current.lastActivity = now;
            storageSet(SESSION_KEY, JSON.stringify(current));
            return current;
        }

        const attribution = readAttribution();
        current = {
            id: uuid('ses'),
            startedAt: now,
            lastActivity: now,
            landingPage: attribution.landingPage,
        };
        storageSet(SESSION_KEY, JSON.stringify(current));
        setTimeout(() => track('session_start'), 0);
        return current;
    }

    function getDevice() {
        const ua = navigator.userAgent || '';
        const width = Math.min(screen.width || 0, window.innerWidth || 0);
        let deviceType = 'desktop';
        if (/Mobi|Android|iPhone|iPod/i.test(ua) || width < 768) deviceType = 'mobile';
        else if (/iPad|Tablet/i.test(ua) || width < 1024) deviceType = 'tablet';

        let browser = 'Outro';
        if (/Edg\//.test(ua)) browser = 'Edge';
        else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
        else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
        else if (/Firefox\//.test(ua)) browser = 'Firefox';

        let os = 'Outro';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/Mac OS/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua)) os = 'Linux';

        return {
            deviceType,
            browser,
            os,
            screen: `${screen.width || 0}x${screen.height || 0}`,
        };
    }

    function basePayload(event, data) {
        const attribution = readAttribution();
        const session = getSession();
        return {
            event,
            visitorId: getVisitorId(),
            sessionId: session.id,
            timestamp: new Date().toISOString(),
            page: location.pathname,
            referrer: attribution.referrer,
            source: attribution.source || attribution.firstSource || 'direto',
            medium: attribution.medium || '',
            campaign: attribution.campaign || '',
            content: attribution.content || '',
            ...getDevice(),
            ...data,
        };
    }

    function send(payload, options) {
        const endpoint = getEndpoint();
        if (!endpoint) return Promise.resolve(false);

        const body = JSON.stringify(payload);
        if (options && options.beacon && navigator.sendBeacon) {
            try {
                return Promise.resolve(navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' })));
            } catch (_) { /* fetch fallback */ }
        }

        return fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).then(() => true).catch(() => false);
    }

    function track(event, data, options) {
        try {
            return send(basePayload(event, data || {}), options || {});
        } catch (_) {
            return Promise.resolve(false);
        }
    }

    function productPayload(product, extra) {
        const p = product || {};
        return {
            product: {
                id: p.id || p.i || p.slug || p.n || p.name || '',
                name: p.name || p.n || '',
                category: p.category || p.categoria || '',
                price: Number(p.price ?? p.a ?? 0),
                quantity: Number(p.quantity || 1),
            },
            ...(extra || {}),
        };
    }

    function trackProductImpressions(root) {
        if (!('IntersectionObserver' in window)) return;
        const seen = new Set();
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const key = `${el.dataset.analyticsProduct || ''}:${el.dataset.analyticsSurface || ''}`;
                if (seen.has(key)) return;
                seen.add(key);
                track('product_impression', {
                    product: {
                        id: el.dataset.analyticsProductId || el.dataset.analyticsProduct || '',
                        name: el.dataset.analyticsProduct || '',
                        category: el.dataset.analyticsCategory || '',
                        price: Number(el.dataset.analyticsPrice || 0),
                    },
                    location: el.dataset.analyticsSurface || 'menu',
                    metadata: { position: el.dataset.analyticsPosition || '' },
                });
                observer.unobserve(el);
            });
        }, { threshold: 0.55 });

        const observeProducts = () => {
            (root || document).querySelectorAll('[data-analytics-product]').forEach(el => observer.observe(el));
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(observeProducts, { timeout: 1500 });
        } else {
            setTimeout(observeProducts, 300);
        }
    }

    document.addEventListener('click', (event) => {
        const target = event.target.closest('[data-analytics-click]');
        if (!target) return;
        track(target.dataset.analyticsClick, {
            buttonName: target.dataset.analyticsButton || target.textContent.trim().slice(0, 60),
            location: target.dataset.analyticsLocation || '',
        });
    }, { capture: true });

    window.SQVAnalytics = {
        getVisitorId,
        getSessionId: () => getSession().id,
        track,
        productPayload,
        trackProductImpressions,
    };

    function trackPageViewWhenIdle() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => track('page_view'), { timeout: 1500 });
        } else {
            setTimeout(() => track('page_view'), 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trackPageViewWhenIdle);
    } else {
        trackPageViewWhenIdle();
    }
})();
