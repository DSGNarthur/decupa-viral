import { useState } from "react"
import { Box, Typography, Chip, Stack, TablePagination } from "@mui/material"
import ScoutResults from "../scout/ScoutResults"

export default function ScoutTab({ jobs, scoutResults, scoutTotal = 0, onFetchResults, page = 0, rowsPerPage = 50, onPageChange, onRowsPerPageChange }) {
  const [selectedJobId, setSelectedJobId] = useState(null)
  const scoutJobs = jobs.filter(j => j.job_type === "scout")

  return (
    <Box>
      {scoutJobs.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip
            label={"Todos os Resultados"}
            onClick={() => { setSelectedJobId(null); onFetchResults(null, 0, rowsPerPage) }}
            color={!selectedJobId ? "primary" : "default"}
            variant={!selectedJobId ? "filled" : "outlined"}
            size="small"
          />
          {scoutJobs.slice(0, 8).map(j => (
            <Chip
              key={j.id}
              label={("" + String(j.created_at ? new Date(j.created_at).toLocaleString([], { month: "curto", day: "numérico", hour: "2 dígitos", minute: "2 dígitos" }) : j.id.slice(0, 8)) + "" + String(j.status === "success" ? " ✓" : j.status === "failed" ? " ✗" : "") + "")}
              onClick={() => { setSelectedJobId(j.id); onFetchResults(j.id, 0, rowsPerPage) }}
              color={selectedJobId === j.id ? "primary" : "default"}
              variant={selectedJobId === j.id ? "filled" : "outlined"}
              size="small"
            />
          ))}
        </Stack>
      )}

      {scoutResults.length > 0 ? (
        <>
          <ScoutResults results={scoutResults}
            onRefresh={() => onFetchResults(selectedJobId, page * rowsPerPage, rowsPerPage)} />
          {/* The job filter travels with every page turn — page 2 of one
              scout run used to fetch page 2 of ALL results. */}
          <TablePagination
            component="div"
            count={scoutTotal}
            page={page}
            onPageChange={(e, p) => onPageChange(e, p, selectedJobId)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => onRowsPerPageChange(e, selectedJobId)}
            rowsPerPageOptions={[20, 50, 100]}
            sx={{ borderTop: 1, borderColor: "divider", mt: 1 }}
          />
        </>
      ) : (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Ainda não há resultados de busca</Typography>
          <Typography variant="body2">Peça ao assistente de chat para buscar vídeos em alta para o seu nicho.</Typography>
        </Box>
      )}
    </Box>
  )
}
