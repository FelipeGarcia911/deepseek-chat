import { Box, Skeleton } from "@mui/material";

const ChatSkeleton = () => {
  return (
    <Box
      sx={{
        alignSelf: "flex-start",
        bgcolor: "grey.300",
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
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="40%" />
    </Box>
  );
};

export default ChatSkeleton;
