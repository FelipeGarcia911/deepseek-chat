import { AppBar, Toolbar, Typography } from "@mui/material";

const Header = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <a href="/" style={{ textDecoration: "none", color: "white" }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Chat con IA
          </Typography>
        </a>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
