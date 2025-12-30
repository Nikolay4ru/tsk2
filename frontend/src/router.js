class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
  }

  addRoute(path, handler) {
    const paramNames = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    
    this.routes.push({
      path,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
  }

  async navigate(path) {
    if (this.currentRoute === path) return;

    this.currentRoute = path;
    window.history.pushState({}, '', path);
    await this.handleRoute(path);
  }

  async handleRoute(path) {
    for (const route of this.routes) {
      const match = path.match(route.pattern);
      
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        
        try {
          await route.handler(params);
        } catch (error) {
          console.error('Route handler error:', error);
        }
        
        return;
      }
    }

    console.warn('No route found for:', path);
  }

  start() {
    window.addEventListener('popstate', () => {
      this.handleRoute(window.location.pathname);
    });

    this.handleRoute(window.location.pathname);
  }
}

export { Router };
export default Router;
