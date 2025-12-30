class Router {
  constructor(routes) {
    this.routes = routes;
    this.currentModule = null;
  }

  async init() {
    window.addEventListener('popstate', () => this.handleRoute());
    
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-link]')) {
        e.preventDefault();
        this.navigate(e.target.getAttribute('href'));
      }
    });

    await this.handleRoute();
  }

  async navigate(path) {
    window.history.pushState(null, null, path);
    await this.handleRoute();
  }

  async handleRoute() {
    const path = window.location.pathname;
    
    console.log('🔀 Routing to:', path);
    
    // Cleanup previous module
    if (this.currentModule && this.currentModule.cleanup) {
      console.log('🧹 Cleaning up previous module');
      this.currentModule.cleanup();
    }

    let route = this.routes.find(r => {
      if (r.path instanceof RegExp) {
        return r.path.test(path);
      }
      return r.path === path;
    });

    if (!route) {
      route = this.routes.find(r => r.path === '/404');
    }

    if (route) {
      const match = route.path instanceof RegExp 
        ? path.match(route.path) 
        : null;
      
      const params = match ? match.slice(1) : [];
      
      this.currentModule = route.module;
      
      if (route.module && route.module.init) {
        await route.module.init(...params);
      }
    }
  }
}

export default Router;
