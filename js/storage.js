// QuickText Voice Pro - Gestion du Stockage
class QuickStorage {
    constructor() {
        this.prefix = 'qtext_';
    }
    
    set(key, value) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }
    
    get(key, defaultValue) {
        try {
            const value = localStorage.getItem(this.prefix + key);
            return value ? JSON.parse(value) : (defaultValue || null);
        } catch (e) {
            return defaultValue || null;
        }
    }
    
    remove(key) {
        localStorage.removeItem(this.prefix + key);
    }
    
    clear() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
        keys.forEach(k => localStorage.removeItem(k));
    }
    
    setSession(key, value) {
        sessionStorage.setItem(this.prefix + key, JSON.stringify(value));
    }
    
    getSession(key, defaultValue) {
        const value = sessionStorage.getItem(this.prefix + key);
        return value ? JSON.parse(value) : (defaultValue || null);
    }
}

window.storage = new QuickStorage();
