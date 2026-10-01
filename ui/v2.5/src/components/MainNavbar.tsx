import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  defineMessages,
  FormattedMessage,
  MessageDescriptor,
  useIntl,
} from "react-intl";
import { Nav, Navbar, Button } from "react-bootstrap";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { LinkContainer } from "react-router-bootstrap";
import { Link, NavLink, useLocation, useHistory } from "react-router-dom";
import Mousetrap from "mousetrap";

import SessionUtils from "src/utils/session";
import { Icon } from "src/components/Shared/Icon";
import { useConfigurationContext } from "src/hooks/Config";
import { ManualStateContext } from "./Help/context";
import { SettingsButton } from "./SettingsButton";
import {
  faBars,
  faChartColumn,
  faFilm,
  faImage,
  faImages,
  faMapMarkerAlt,
  faPlayCircle,
  faQuestionCircle,
  faSignOutAlt,
  faTag,
  faTimes,
  faUser,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import { baseURL } from "src/core/createClient";
import { PatchComponent } from "src/patch";

interface IMenuItem {
  name: string;
  message: MessageDescriptor;
  href: string;
  icon: IconDefinition;
  hotkey: string;
  userCreatable?: boolean;
}
const messages = defineMessages({
  scenes: {
    id: "scenes",
    defaultMessage: "Scenes",
  },
  images: {
    id: "images",
    defaultMessage: "Images",
  },
  groups: {
    id: "groups",
    defaultMessage: "Groups",
  },
  markers: {
    id: "markers",
    defaultMessage: "Markers",
  },
  performers: {
    id: "performers",
    defaultMessage: "Performers",
  },
  studios: {
    id: "studios",
    defaultMessage: "Studios",
  },
  tags: {
    id: "tags",
    defaultMessage: "Tags",
  },
  galleries: {
    id: "galleries",
    defaultMessage: "Galleries",
  },
  sceneTagger: {
    id: "sceneTagger",
    defaultMessage: "Scene Tagger",
  },
  donate: {
    id: "donate",
    defaultMessage: "Donate",
  },
  statistics: {
    id: "statistics",
    defaultMessage: "Statistics",
  },
});

const allMenuItems: IMenuItem[] = [
  {
    name: "scenes",
    message: messages.scenes,
    href: "/scenes",
    icon: faPlayCircle,
    hotkey: "g s",
    userCreatable: true,
  },
  {
    name: "images",
    message: messages.images,
    href: "/images",
    icon: faImage,
    hotkey: "g i",
  },
  {
    name: "groups",
    message: messages.groups,
    href: "/groups",
    icon: faFilm,
    hotkey: "g v",
    userCreatable: true,
  },
  {
    name: "markers",
    message: messages.markers,
    href: "/scenes/markers",
    icon: faMapMarkerAlt,
    hotkey: "g k",
  },
  {
    name: "galleries",
    message: messages.galleries,
    href: "/galleries",
    icon: faImages,
    hotkey: "g l",
    userCreatable: true,
  },
  {
    name: "performers",
    message: messages.performers,
    href: "/performers",
    icon: faUser,
    hotkey: "g p",
    userCreatable: true,
  },
  {
    name: "studios",
    message: messages.studios,
    href: "/studios",
    icon: faVideo,
    hotkey: "g u",
    userCreatable: true,
  },
  {
    name: "tags",
    message: messages.tags,
    href: "/tags",
    icon: faTag,
    hotkey: "g t",
    userCreatable: true,
  },
];

const newPathsList = allMenuItems
  .filter((item) => item.userCreatable)
  .map((item) => item.href);

const MainNavbarMenuItems = PatchComponent(
  "MainNavBar.MenuItems",
  (props: React.PropsWithChildren<unknown>) => {
    return <Nav>{props.children}</Nav>;
  }
);

const MainNavbarUtilityItems = PatchComponent(
  "MainNavBar.UtilityItems",
  (props: React.PropsWithChildren<unknown>) => {
    return <>{props.children}</>;
  }
);

export const MainNavbar: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { configuration } = useConfigurationContext();
  const { openManual } = React.useContext(ManualStateContext);

  const [expanded, setExpanded] = useState(false);

  // Show all menu items by default, unless config says otherwise
  const menuItems = useMemo(() => {
    let cfgMenuItems = configuration?.interface.menuItems;
    if (!cfgMenuItems) {
      return allMenuItems;
    }

    // translate old movies menu item to groups
    cfgMenuItems = cfgMenuItems.map((item) => {
      if (item === "movies") {
        return "groups";
      }
      return item;
    });

    return allMenuItems.filter((menuItem) =>
      cfgMenuItems!.includes(menuItem.name)
    );
  }, [configuration]);

  // react-bootstrap typing bug
  const navbarRef = useRef<HTMLElement | null>(null);
  const intl = useIntl();

  const maybeCollapse = useCallback((event: Event) => {
    if (
      navbarRef.current &&
      event.target instanceof Node &&
      !navbarRef.current.contains(event.target)
    ) {
      setExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      document.addEventListener("click", maybeCollapse);
      document.addEventListener("touchstart", maybeCollapse);
    }
    return () => {
      document.removeEventListener("click", maybeCollapse);
      document.removeEventListener("touchstart", maybeCollapse);
    };
  }, [expanded, maybeCollapse]);

  const goto = useCallback(
    (page: string) => {
      history.push(page);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    [history]
  );

  const pathname = location.pathname.replace(/\/$/, "");
  let newPath = newPathsList.includes(pathname) ? `${pathname}/new` : null;
  if (newPath !== null) {
    const queryParam = new URLSearchParams(location.search).get("q");
    if (queryParam) {
      newPath += "?q=" + encodeURIComponent(queryParam);
    }
  }

  // set up hotkeys
  useEffect(() => {
    Mousetrap.bind("?", () => openManual());
    Mousetrap.bind("g z", () => goto("/settings"));

    menuItems.forEach((item) => {
      Mousetrap.bind(item.hotkey, () => goto(item.href));
    });

    if (newPath) {
      Mousetrap.bind("n", () => history.push(String(newPath)));
    }

    return () => {
      Mousetrap.unbind("?");
      Mousetrap.unbind("g z");
      menuItems.forEach((item) => {
        Mousetrap.unbind(item.hotkey);
      });

      if (newPath) {
        Mousetrap.unbind("n");
      }
    };
  });

  function maybeRenderLogout() {
    if (SessionUtils.isLoggedIn()) {
      return (
        <Button
          className="minimal logout-button d-flex align-items-center"
          href={`${baseURL}logout`}
          title={intl.formatMessage({ id: "actions.logout" })}
        >
          <Icon icon={faSignOutAlt} />
        </Button>
      );
    }
  }

  const handleDismiss = useCallback(() => setExpanded(false), []);

  function renderUtilityButtons() {
    return (
      <>
        <Nav.Link
          className="nav-utility d-flex align-items-center h-100"
          href="https://opencollective.com/stashapp"
          target="_blank"
          onClick={handleDismiss}
        >
          <Button
            className="minimal donate d-flex align-items-center h-100"
            title={intl.formatMessage({ id: "donate" })}
          >
            <span>
              {intl.formatMessage(messages.donate)}
            </span>
          </Button>
        </Nav.Link>
        <NavLink
          className="nav-utility d-flex align-items-center h-100"
          exact
          to="/stats"
          onClick={handleDismiss}
        >
          <Button
            className="minimal d-flex align-items-center h-100"
            title={intl.formatMessage({ id: "statistics" })}
          >
            <Icon icon={faChartColumn} />
          </Button>
        </NavLink>
        <NavLink
          className="nav-utility d-flex align-items-center h-100"
          exact
          to="/settings"
          onClick={handleDismiss}
        >
          <SettingsButton />
        </NavLink>
        <Button
          className="nav-utility minimal d-flex align-items-center h-100"
          onClick={() => openManual()}
          title={intl.formatMessage({ id: "help" })}
        >
          <Icon icon={faQuestionCircle} />
        </Button>
        {maybeRenderLogout()}
      </>
    );
  }

  return (
    <Navbar
      collapseOnSelect
      fixed="top"
      variant="dark"
      bg="dark"
      className="top-nav"
      expand="xl"
      expanded={expanded}
      onToggle={setExpanded}
      ref={navbarRef}
    >
      <Navbar.Collapse className="bg-dark order-sm-1">
        <MainNavbarMenuItems>
          {menuItems.map(({ href, icon, message }) => (
            <Nav.Link
              eventKey={href}
              as="div"
              key={href}
              className="col-4 col-sm-3 col-md-2 col-lg-auto d-flex align-items-center h-100"
            >
              <LinkContainer activeClassName="active" exact to={href}>
                <Button className="minimal p-4 p-xl-0 d-flex flex-column flex-xl-row justify-content-center align-items-center h-100">
                  <Icon
                    {...{ icon }}
                    className="nav-menu-icon d-block d-xl-none mb-2 mb-xl-0"
                  />
                  <span>{intl.formatMessage(message)}</span>
                </Button>
              </LinkContainer>
            </Nav.Link>
          ))}
        </MainNavbarMenuItems>
        <div className="d-xl-none mobile-nav-utilities w-100">
          <div className="d-flex justify-content-around align-items-center py-2">
            <NavLink
              exact
              to="/settings"
              onClick={handleDismiss}
              className="d-flex flex-column align-items-center text-muted text-decoration-none"
            >
              <SettingsButton />
              <span className="small mt-1">
                {intl.formatMessage({ id: "settings" })}
              </span>
            </NavLink>
            <NavLink
              exact
              to="/stats"
              onClick={handleDismiss}
              className="d-flex flex-column align-items-center text-muted text-decoration-none"
            >
              <Button className="minimal p-0 d-flex align-items-center justify-content-center">
                <Icon icon={faChartColumn} />
              </Button>
              <span className="small mt-1">
                {intl.formatMessage({ id: "statistics" })}
              </span>
            </NavLink>
            <div
              className="d-flex flex-column align-items-center text-muted cursor-pointer"
              onClick={() => {
                handleDismiss();
                openManual();
              }}
            >
              <Button className="minimal p-0 d-flex align-items-center justify-content-center">
                <Icon icon={faQuestionCircle} />
              </Button>
              <span className="small mt-1">
                {intl.formatMessage({ id: "help" })}
              </span>
            </div>
            {SessionUtils.isLoggedIn() && (
              <a
                className="d-flex flex-column align-items-center text-muted text-decoration-none logout-button"
                href={`${baseURL}logout`}
              >
                <Button className="minimal p-0 d-flex align-items-center justify-content-center">
                  <Icon icon={faSignOutAlt} />
                </Button>
                <span className="small mt-1">
                  {intl.formatMessage({ id: "actions.logout" })}
                </span>
              </a>
            )}
          </div>
        </div>
      </Navbar.Collapse>

      <Navbar.Brand as="div" onClick={handleDismiss} className="d-flex align-items-center h-100">
        <Link to="/" className="d-flex align-items-center h-100">
          <Button className="minimal brand-link d-flex align-items-center h-100">Stash</Button>
        </Link>
      </Navbar.Brand>

      <Nav className="navbar-buttons flex-row ml-auto order-xl-2 d-flex align-items-center h-100">
        {!!newPath && (
          <div className="mr-2 d-flex align-items-center">
            <Link to={newPath} className="d-flex align-items-center">
              <Button variant="primary" data-action="new" className="d-flex align-items-center justify-content-center">
                <FormattedMessage id="new" defaultMessage="New" />
              </Button>
            </Link>
          </div>
        )}
        <MainNavbarUtilityItems>
          {renderUtilityButtons()}
        </MainNavbarUtilityItems>
        <Navbar.Toggle className="nav-menu-toggle ml-sm-2">
          <Icon icon={expanded ? faTimes : faBars} />
        </Navbar.Toggle>
      </Nav>
    </Navbar>
  );
};
