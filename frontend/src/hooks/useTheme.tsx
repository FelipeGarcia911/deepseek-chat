import { useState, useEffect, useMemo } from "react";
import { lightTheme, darkTheme } from "../styles/theme";

const useAutoTheme = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const updateThemeBasedOnTime = () => {
      const hour = new Date().getHours();
      setIsDarkMode(hour >= 18 || hour < 6);
    };

    updateThemeBasedOnTime();
    const interval = setInterval(updateThemeBasedOnTime, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const theme = useMemo(() => (isDarkMode ? darkTheme : lightTheme), [isDarkMode]);

  return { theme, isDarkMode };
};

export default useAutoTheme;
