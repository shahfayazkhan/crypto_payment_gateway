'use client';
import { Paper } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { gridSx } from './columns';

export default function LiveGrid({ list, columns, height = 640, onRowClick }) {
  return (
    <Paper sx={{ height, width: '100%' }}>
      <DataGrid
        rows={list.rows}
        columns={columns}
        getRowId={(r) => r._id}
        rowCount={list.total}
        loading={list.loading}
        paginationMode="server"
        paginationModel={list.paginationModel}
        onPaginationModelChange={list.setPaginationModel}
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        disableColumnMenu
        disableColumnSorting // server-paginated: client-side sort would only reorder the current page
        rowHeight={56}
        getRowClassName={(p) => (list.flash[p.id] ? 'row-flash' : '')}
        onRowClick={onRowClick}
        sx={gridSx}
      />
    </Paper>
  );
}
