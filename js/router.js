import $ from 'jquery';
import { Router } from 'backbone';
import { getGuid } from './utils';
import { getPageContainer } from './utils/selectors';
import app from './app';
import UserPage from './views/userPage/UserPage';
import TransactionsPage from './views/TransactionsPage';
import TemplateOnly from './views/TemplateOnly';
import ListingPage from './views/Listing';
import Profile from './models/Profile';
import Listing from './models/listing/Listing';

export default class ObRouter extends Router {
  constructor(options = {}) {
    super(options);
    this.options = options;

    const routes = [
      [/^@([^\/]+)[\/]?([^\/]*)[\/]?([^\/]*)[\/]?([^\/]*)$/, 'userViaHandle'],
      [/^(Qm[a-zA-Z0-9]+)[\/]?([^\/]*)[\/]?([^\/]*)[\/]?([^\/]*)$/, 'user'],
      // [/^@([^\/]+)[\/]?$/, 'userViaHandle'],
      // [/^(Qm[a-zA-Z0-9]+)[\/]?$/, 'user'],
      // [/^@([^\/]+)[\/]?home[\/]?$/, 'userViaHandle'],
      // [/^(Qm[a-zA-Z0-9]+)[\/]?home[\/]?$/, 'user'],
      // [/^@([^\/]+)[\/]?store[\/]?$/, 'userViaHandle'],
      // [/^(Qm[a-zA-Z0-9]+)[\/]?store[\/]?$/, 'user'],
      // [/^@([^\/]+)[\/]?store[\/]?$/, 'userViaHandle'],
      // [/^(Qm[a-zA-Z0-9]+)[\/]?store[\/]?$/, 'user'],
      // [/^@([^\/]+)[\/]?store[\/]?$/, 'userViaHandle'],
      // [/^(Qm[a-zA-Z0-9]+)[\/]?store[\/]?$/, 'user'],
      // [/^@([^\/]+)[\/]?store[\/]?$/, 'userViaHandle'],
      // [/^(Qm[a-zA-Z0-9]+)[\/]?store[\/]?$/, 'user'],
      // [/^ownPage[\/]?(.*?)$/, 'ownPage'],
      ['transactions', 'transactions'],
      ['transactions/:tab', 'transactions'],
      // temporary route
      ['listing/:guid/:slug', 'listing'],
      ['*path', 'pageNotFound'],
    ];

    routes.slice(0)
      .reverse()
      .forEach((route) => this.route.apply(this, route));

    this.setAddressBarText();

    $(window).on('hashchange', () => {
      this.setAddressBarText();
    });
  }

  setAddressBarText() {
    if (
      location.hash.startsWith('#transactions') ||
      location.hash.startsWith('#test-')
    ) {
      // certain pages should not have their route visible
      // in the address bar
      app.pageNav.setAddressBar('');
    } else {
      app.pageNav.setAddressBar(location.hash.slice(1));
    }
  }

  execute(callback, args) {
    app.loadingModal.open();

    if (callback) {
      this.trigger('will-route');
      callback.apply(this, args);
    }
  }

  loadPage(vw) {
    if (this.currentPage) {
      this.currentPage.remove();
    }

    this.currentPage = vw;
    getPageContainer().append(vw.el);
    app.loadingModal.close();
  }

  userViaHandle(handle, ...args) {
    getGuid(handle).done((guid) => {
      this.user(guid, ...args);
    }).fail(() => {
      this.userNotFound();
    });
  }

  get userStates() {
    return [
      'home',
      'store',
      'following',
      'followers',
      'listing',
    ];
  }

  isValidUserRoute(guid, state, ...deepRouteParts) {
    if (deepRouteParts.length) {
      // Args currently serves as a placeholder for potential
      // future route parts beyond <guid/handle>/<state>. Right
      // now we have no such routes, thus the blanket false.
      return false;

      // Once some routes have those deeper parts, the code here should
      // selectively not go to pageNotFound if those parts are met. E.g.
      // <guid/handle>/store/new-listings becomes a route, then the
      // code could be:
      // if (state ==='store') {
      //   if (deepRouteParts.length > 1 || (deepRouteParts.length === 1) &&
      //     deepRouteParts[0] !== 'new-listings') {
      //     return false;
      //   } else if (deepRouteParts.length) {
      //     return false;
      //   }
      // }
    }

    return true;
  }

  user(guid, state, ...args) {
    if (state && this.userStates.indexOf(state) === -1) {
      this.pageNotFound();
      return;
    }

    let tab = state || 'store';
    const deepRouteParts = args.filter(arg => arg !== null);

    if (!state) {
      this.navigate(`${guid}/store${deepRouteParts ? deepRouteParts.join('/') : ''}`, {
        replace: true,
      });
    }

    if (state === 'listing') {
      tab = 'store';
    }

    if (!this.isValidUserRoute(guid, state, ...deepRouteParts)) {
      this.pageNotFound();
      return;
    }

    // If out current page is the user page of the given guid,
    // we'll just update the state of the existing page,
    // rather than fetching data and loading a new one.
    if (this.currentPage instanceof UserPage && this.currentPage.model.id === guid) {
      this.currentPage.setState(state || 'store');
      app.loadingModal.close();
      return;
    }

    let profile;
    let profileFetch;
    let onWillRoute;

    if (guid === app.profile.id) {
      // don't fetch our own profile, since we have it already
      profileFetch = $.Deferred().resolve();
      profile = app.profile;
    } else {
      profile = new Profile({ id: guid });
      profileFetch = profile.fetch();

      onWillRoute = () => {
        profileFetch.abort();
      };
      this.once('will-route', onWillRoute);
    }

    profileFetch.done(() => {
      this.loadPage(
        new UserPage({
          tab,
          model: profile,
        }).render()
      );
    }).fail((jqXhr) => {
      if (jqXhr.statusText !== 'abort') this.userNotFound();
    }).always(() => {
      if (onWillRoute) this.off(null, onWillRoute);
    });
  }

  // ownPage(subPath) {
  //   this.navigate(`${app.profile.id}/${subPath === null ? '' : subPath}`, {
  //     trigger: true,
  //     replace: true,
  //   });
  // }

  listing(guid, slug) {
    const listing = new Listing({
      listing: { slug },
    }, { guid });

    let onWillRoute = () => {};
    this.once('will-route', onWillRoute);

    const listingFetch = listing.fetch();

    onWillRoute = () => {
      listingFetch.abort();
    };

    listingFetch.done((jqXhr) => {
      if (jqXhr && jqXhr.statusText === 'abort') return;

      this.loadPage(
        new ListingPage({
          model: listing,
        }).render()
      );
    }).fail((jqXhr) => {
      if (jqXhr.statusText !== 'abort') this.listingNotFound();
    }).always(() => {
      if (onWillRoute) this.off(null, onWillRoute);
    });
  }

  transactions(tab) {
    tab = tab || 'inbound'; // eslint-disable-line no-param-reassign

    this.loadPage(
      new TransactionsPage({ tab }).render()
    );
  }

  userNotFound() {
    this.loadPage(
      new TemplateOnly({ template: 'error-pages/userNotFound.html' }).render()
    );
  }

  pageNotFound() {
    this.loadPage(
      new TemplateOnly({ template: 'error-pages/pageNotFound.html' }).render()
    );
  }

  listingNotFound() {
    this.loadPage(
      new TemplateOnly({ template: 'error-pages/listingNotFound.html' }).render()
    );
  }
}
