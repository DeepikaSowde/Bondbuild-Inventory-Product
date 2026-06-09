// frontend/src/config/stockPermissions.js
// Stock Page Role-Based Permissions Configuration

export const STOCK_PERMISSIONS = {
  Drafter: {
    viewStock: true,
    viewUnitPrice: false,
    viewTotalValue: false,
    editQuantity: false,
    editLocation: false,
    addItem: false,
    deleteItem: false,
    exportExcel: true,
  },
  Manager: {
    viewStock: true,
    viewUnitPrice: true,
    viewTotalValue: true,
    editQuantity: true,
    editLocation: true,
    addItem: true,
    deleteItem: false,
    exportExcel: true,
  },
  Purchaser: {
    viewStock: true,
    viewUnitPrice: true,
    viewTotalValue: true,
    editQuantity: true,
    editLocation: true,
    addItem: true,
    deleteItem: false,
    exportExcel: true,
  },
  "Factory In-charge": {
    viewStock: true,
    viewUnitPrice: false,
    viewTotalValue: false,
    editQuantity: true,
    editLocation: true,
    addItem: false,
    deleteItem: false,
    exportExcel: true,
  },
  Supervisor: {
    viewStock: true,
    viewUnitPrice: false,
    viewTotalValue: false,
    editQuantity: true,
    editLocation: false,
    addItem: false,
    deleteItem: false,
    exportExcel: true,
  },
  QS: {
    viewStock: true,
    viewUnitPrice: true,
    viewTotalValue: true,
    editQuantity: false,
    editLocation: false,
    addItem: false,
    deleteItem: false,
    exportExcel: true,
  },
  Admin: {
    viewStock: true,
    viewUnitPrice: true,
    viewTotalValue: true,
    editQuantity: true,
    editLocation: true,
    addItem: true,
    deleteItem: true,
    exportExcel: true,
  },
};

// Helper function to get permissions for a role
export const getRolePermissions = (role) => {
  return STOCK_PERMISSIONS[role] || STOCK_PERMISSIONS.Drafter; // Default to most restrictive
};

// Helper function to check if user can perform action
export const canUserPerformAction = (userRole, action) => {
  const permissions = getRolePermissions(userRole);
  return permissions[action] || false;
};
