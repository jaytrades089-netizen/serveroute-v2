import WorkerHome from './pages/WorkerHome';
import WorkerRoutes from './pages/WorkerRoutes';
import WorkerSettings from './pages/WorkerSettings';
import Workers from './pages/Workers';
import Notifications from './pages/Notifications';
import WorkerAddresses from './pages/WorkerAddresses';
import WorkerPayout from './pages/WorkerPayout';
import WorkerRouteDetail from './pages/WorkerRouteDetail';

export const PAGES = {
    "WorkerHome": WorkerHome,
    "WorkerRoutes": WorkerRoutes,
    "WorkerSettings": WorkerSettings,
    "Workers": Workers,
    "Notifications": Notifications,
    "WorkerAddresses": WorkerAddresses,
    "WorkerPayout": WorkerPayout,
    "WorkerRouteDetail": WorkerRouteDetail,
}

export const pagesConfig = {
    mainPage: "WorkerHome",
    Pages: PAGES,
};