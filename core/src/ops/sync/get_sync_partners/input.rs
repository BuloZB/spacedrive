//! Input for get sync partners operation

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GetSyncPartnersInput {}
