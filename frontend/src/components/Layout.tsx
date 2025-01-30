import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import DrawerMenu from "./DrawerMenu";

const Layout = () => {
  return (
    <Box sx={{ display: "flex", height: "100vh", width: "100vw" }}>
      <DrawerMenu />
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flexGrow: 1, p: 2 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
