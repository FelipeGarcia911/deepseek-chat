import { Box, Skeleton, useTheme } from "@mui/material";

const ChatSkeleton = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        alignSelf: "flex-start",
        bgcolor: theme.palette.background.paper,
        borderRadius: 2,
        boxShadow: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        mb: 1,
        p: 1.5,
        textAlign: "left",
        width: "60%",
      }}
    >
      <Skeleton variant="text" width="60%" sx={{ bgcolor: theme.palette.grey[500] }} />
      <Skeleton variant="text" width="80%" sx={{ bgcolor: theme.palette.grey[600] }} />
      <Skeleton variant="text" width="40%" sx={{ bgcolor: theme.palette.grey[700] }} />
    </Box>
  );
};

export default ChatSkeleton;
