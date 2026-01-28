import Notifications from './pages/Notifications';
import WorkerAddresses from './pages/WorkerAddresses';
import WorkerHome from './pages/WorkerHome';
import WorkerPayout from './pages/WorkerPayout';
import WorkerRouteDetail from './pages/WorkerRouteDetail';
import WorkerRoutes from './pages/WorkerRoutes';
import WorkerSettings from './pages/WorkerSettings';
import Workers from './pages/Workers';


export const PAGES = {
    "Notifications": Notifications,
    "WorkerAddresses": WorkerAddresses,
    "WorkerHome": WorkerHome,
    "WorkerPayout": WorkerPayout,
    "WorkerRouteDetail": WorkerRouteDetail,
    "WorkerRoutes": WorkerRoutes,
    "WorkerSettings": WorkerSettings,
    "Workers": Workers,
}

export const pagesConfig = {
    mainPage: "WorkerHome",
    Pages: PAGES,
};