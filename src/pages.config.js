/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AddAddress from './pages/AddAddress';
import AddressImport from './pages/AddressImport';
import AddressPool from './pages/AddressPool';
import AssignRoute from './pages/AssignRoute';
import BossDashboard from './pages/BossDashboard';
import BossNotifications from './pages/BossNotifications';
import BossRoutes from './pages/BossRoutes';
import BossSettings from './pages/BossSettings';
import BossTeam from './pages/BossTeam';
import BossWorkers from './pages/BossWorkers';
import CreateRoute from './pages/CreateRoute';
import DCNBatchDetail from './pages/DCNBatchDetail';
import DCNMatching from './pages/DCNMatching';
import DCNUpload from './pages/DCNUpload';
import EditAddress from './pages/EditAddress';
import Notifications from './pages/Notifications';
import ReassignRoute from './pages/ReassignRoute';
import ReceiptDetail from './pages/ReceiptDetail';
import ReceiptQueue from './pages/ReceiptQueue';
import ReceiptReview from './pages/ReceiptReview';
import RouteEditor from './pages/RouteEditor';
import RouteHandoff from './pages/RouteHandoff';
import ScanCamera from './pages/ScanCamera';
import ScanDocumentType from './pages/ScanDocumentType';
import ScanPreview from './pages/ScanPreview';
import ScanRouteSetup from './pages/ScanRouteSetup';
import SubmitReceipt from './pages/SubmitReceipt';
import UnassignRoute from './pages/UnassignRoute';
import VacationRequests from './pages/VacationRequests';
import WorkerAddresses from './pages/WorkerAddresses';
import WorkerDetail from './pages/WorkerDetail';
import WorkerHome from './pages/WorkerHome';
import WorkerPayout from './pages/WorkerPayout';
import WorkerReceipts from './pages/WorkerReceipts';
import WorkerRouteDetail from './pages/WorkerRouteDetail';
import WorkerRoutes from './pages/WorkerRoutes';
import WorkerSettings from './pages/WorkerSettings';
import WorkerStats from './pages/WorkerStats';
import WorkerVacationRequest from './pages/WorkerVacationRequest';
import Workers from './pages/Workers';
import Chat from './pages/Chat';
import ScanVerify from './pages/ScanVerify';
import AddressQuestionDetail from './pages/AddressQuestionDetail';
import Analytics from './pages/Analytics';
import WorkerMap from './pages/WorkerMap';
import ActivityLog from './pages/ActivityLog';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AddAddress": AddAddress,
    "AddressImport": AddressImport,
    "AddressPool": AddressPool,
    "AssignRoute": AssignRoute,
    "BossDashboard": BossDashboard,
    "BossNotifications": BossNotifications,
    "BossRoutes": BossRoutes,
    "BossSettings": BossSettings,
    "BossTeam": BossTeam,
    "BossWorkers": BossWorkers,
    "CreateRoute": CreateRoute,
    "DCNBatchDetail": DCNBatchDetail,
    "DCNMatching": DCNMatching,
    "DCNUpload": DCNUpload,
    "EditAddress": EditAddress,
    "Notifications": Notifications,
    "ReassignRoute": ReassignRoute,
    "ReceiptDetail": ReceiptDetail,
    "ReceiptQueue": ReceiptQueue,
    "ReceiptReview": ReceiptReview,
    "RouteEditor": RouteEditor,
    "RouteHandoff": RouteHandoff,
    "ScanCamera": ScanCamera,
    "ScanDocumentType": ScanDocumentType,
    "ScanPreview": ScanPreview,
    "ScanRouteSetup": ScanRouteSetup,
    "SubmitReceipt": SubmitReceipt,
    "UnassignRoute": UnassignRoute,
    "VacationRequests": VacationRequests,
    "WorkerAddresses": WorkerAddresses,
    "WorkerDetail": WorkerDetail,
    "WorkerHome": WorkerHome,
    "WorkerPayout": WorkerPayout,
    "WorkerReceipts": WorkerReceipts,
    "WorkerRouteDetail": WorkerRouteDetail,
    "WorkerRoutes": WorkerRoutes,
    "WorkerSettings": WorkerSettings,
    "WorkerStats": WorkerStats,
    "WorkerVacationRequest": WorkerVacationRequest,
    "Workers": Workers,
    "Chat": Chat,
    "ScanVerify": ScanVerify,
    "AddressQuestionDetail": AddressQuestionDetail,
    "Analytics": Analytics,
    "WorkerMap": WorkerMap,
    "ActivityLog": ActivityLog,
}

export const pagesConfig = {
    mainPage: "WorkerHome",
    Pages: PAGES,
    Layout: __Layout,
};