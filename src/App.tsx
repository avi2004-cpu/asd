// Constraint 6 -- fixed routes (owned by Person 2):
//   /login  /signup  /parent  /play/:childId  /doctor  /doctor/report/:childId
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ParentHome from "./pages/ParentHome";
import DoctorList from "./pages/DoctorList";
// The report pulls in the charting library; load it only when a doctor opens a report.
const DoctorReport = lazy(() => import("./pages/DoctorReport"));
// Person 1: replace with `import PlaySession from "./pages/PlaySession";` when the camera game lands.
// The page receives :childId from the route and ?mode=game|video from the query string.
import PlaySession from "./pages/PlaySessionStub";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/parent"
        element={
          <RequireAuth role="parent">
            <ParentHome />
          </RequireAuth>
        }
      />
      <Route
        path="/play/:childId"
        element={
          <RequireAuth role="parent">
            <PlaySession />
          </RequireAuth>
        }
      />
      <Route
        path="/doctor"
        element={
          <RequireAuth role="doctor">
            <DoctorList />
          </RequireAuth>
        }
      />
      <Route
        path="/doctor/report/:childId"
        element={
          <RequireAuth role="doctor">
            <Suspense fallback={<Spinner label="Loading report…" />}>
              <DoctorReport />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
