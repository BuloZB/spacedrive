//! Redundancy awareness operations
//!
//! Provides queries for understanding data redundancy across volumes:
//! - Summary statistics (per-volume at-risk vs redundant bytes)
//! - Integration with search filters for file-level redundancy queries

pub mod summary;
