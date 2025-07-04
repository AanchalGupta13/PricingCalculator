// toast.js - Shared notification module
class Toast {
    static init() {
        // Create container if it doesn't exist
        if (!document.getElementById('toastContainer')) {
            const container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    static show(message, type = 'error', duration = 10000) {
        this.init();
        const container = document.getElementById('toastContainer');
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close">&times;</button>
        `;
        
        container.appendChild(toast);
        
        // Auto-remove after duration
        const timer = setTimeout(() => {
            toast.style.animation = 'fadeOut 0.10s ease-out';
            setTimeout(() => toast.remove(), 1000);
        }, duration);
        
        // Manual close
        toast.querySelector('.toast-close').addEventListener('click', () => {
            clearTimeout(timer);
            toast.style.animation = 'fadeOut 0.10s ease-out';
            setTimeout(() => toast.remove(), 1000);
        });
    }

    // Shortcut methods
    static error(message, duration) {
        this.show(message, 'error', duration);
    }
    
    static success(message, duration) {
        this.show(message, 'success', duration);
    }
    
    static warning(message, duration) {
        this.show(message, 'warning', duration);
    }
    
    static info(message, duration) {
        this.show(message, 'info', duration);
    }
}

// Override the global alert function
window.alert = function(message) {
    Toast.error(message);
};

// Make Toast available globally
window.Toast = Toast;