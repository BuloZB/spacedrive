//! Search filter utilities

use super::input::*;
use crate::domain::ContentKind;
use crate::filetype::FileTypeRegistry;
use sea_orm::{sea_query::Expr, ColumnTrait, Condition};
use uuid::Uuid;

/// Filter builder for search queries
pub struct FilterBuilder {
	condition: Condition,
}

impl FilterBuilder {
	pub fn new() -> Self {
		Self {
			condition: Condition::all(),
		}
	}

	pub fn build(self) -> Condition {
		self.condition
	}

	/// Apply file type filter
	pub fn file_types(mut self, file_types: &Option<Vec<String>>) -> Self {
		if let Some(types) = file_types {
			if !types.is_empty() {
				let mut file_type_condition = Condition::any();
				for file_type in types {
					file_type_condition = file_type_condition
						.add(crate::infra::db::entities::entry::Column::Extension.eq(file_type));
				}
				self.condition = self.condition.add(file_type_condition);
			}
		}
		self
	}

	/// Apply date range filter
	pub fn date_range(mut self, date_range: &Option<DateRangeFilter>) -> Self {
		if let Some(range) = date_range {
			let date_column = match range.field {
				DateField::CreatedAt => crate::infra::db::entities::entry::Column::CreatedAt,
				DateField::ModifiedAt => crate::infra::db::entities::entry::Column::ModifiedAt,
				DateField::AccessedAt => crate::infra::db::entities::entry::Column::AccessedAt,
				DateField::IndexedAt => crate::infra::db::entities::entry::Column::IndexedAt,
			};

			if let Some(start) = range.start {
				self.condition = self.condition.add(date_column.gte(start));
			}
			if let Some(end) = range.end {
				self.condition = self.condition.add(date_column.lte(end));
			}
		}
		self
	}

	/// Apply size range filter
	pub fn size_range(mut self, size_range: &Option<SizeRangeFilter>) -> Self {
		if let Some(range) = size_range {
			if let Some(min) = range.min {
				self.condition = self
					.condition
					.add(crate::infra::db::entities::entry::Column::Size.gte(min as i64));
			}
			if let Some(max) = range.max {
				self.condition = self
					.condition
					.add(crate::infra::db::entities::entry::Column::Size.lte(max as i64));
			}
		}
		self
	}

	/// Apply location filter
	pub fn locations(mut self, locations: &Option<Vec<uuid::Uuid>>) -> Self {
		if let Some(locs) = locations {
			if !locs.is_empty() {
				// TODO: Add location filtering when location_id is available in entry table
				// let mut location_condition = Condition::any();
				// for location_id in locs {
				//     location_condition = location_condition.add(
				//         crate::infra::db::entities::entry::Column::LocationId.eq(*location_id)
				//     );
				// }
				// self.condition = self.condition.add(location_condition);
			}
		}
		self
	}

	/// Apply content type filter using the file type registry
	pub fn content_types(
		mut self,
		content_types: &Option<Vec<ContentKind>>,
		registry: &FileTypeRegistry,
	) -> Self {
		if let Some(types) = content_types {
			if !types.is_empty() {
				let mut content_condition = Condition::any();
				for content_type in types {
					let extensions = registry.get_extensions_for_category(*content_type);
					for extension in extensions {
						content_condition = content_condition.add(
							crate::infra::db::entities::entry::Column::Extension.eq(extension),
						);
					}
				}
				self.condition = self.condition.add(content_condition);
			}
		}
		self
	}

	/// Filter by redundancy status: at_risk=true means content on exactly 1 volume
	pub fn at_risk(mut self, at_risk: &Option<bool>) -> Self {
		if let Some(is_at_risk) = at_risk {
			let having = if *is_at_risk { "= 1" } else { "> 1" };
			self.condition = self.condition.add(Expr::cust(format!(
				"entries.content_id IN (\
				    SELECT e2.content_id FROM entries e2 \
				    WHERE e2.content_id IS NOT NULL AND e2.volume_id IS NOT NULL \
				    GROUP BY e2.content_id \
				    HAVING COUNT(DISTINCT e2.volume_id) {}\
				)",
				having
			)));
		}
		self
	}

	/// Filter to files whose content is present on the specified volumes
	pub fn on_volumes(mut self, on_volumes: &Option<Vec<Uuid>>) -> Self {
		if let Some(uuids) = on_volumes {
			if !uuids.is_empty() {
				let uuid_list = uuids
					.iter()
					.map(uuid_to_sqlite_blob_literal)
					.collect::<Vec<_>>()
					.join(",");
				self.condition = self.condition.add(Expr::cust(format!(
					"entries.content_id IN (\
					    SELECT e2.content_id FROM entries e2 \
					    INNER JOIN volumes v ON e2.volume_id = v.id \
					    WHERE e2.content_id IS NOT NULL \
					    AND v.uuid IN ({})\
					)",
					uuid_list
				)));
			}
		}
		self
	}

	/// Filter to files whose content is NOT present on the specified volumes
	pub fn not_on_volumes(mut self, not_on_volumes: &Option<Vec<Uuid>>) -> Self {
		if let Some(uuids) = not_on_volumes {
			if !uuids.is_empty() {
				let uuid_list = uuids
					.iter()
					.map(uuid_to_sqlite_blob_literal)
					.collect::<Vec<_>>()
					.join(",");
				self.condition = self.condition.add(Expr::cust(format!(
					"entries.content_id NOT IN (\
					    SELECT e2.content_id FROM entries e2 \
					    INNER JOIN volumes v ON e2.volume_id = v.id \
					    WHERE e2.content_id IS NOT NULL \
					    AND v.uuid IN ({})\
					)",
					uuid_list
				)));
			}
		}
		self
	}

	/// Filter by minimum number of volumes content exists on
	pub fn min_volume_count(mut self, min_count: &Option<u32>) -> Self {
		if let Some(min) = min_count {
			self.condition = self.condition.add(Expr::cust(format!(
				"entries.content_id IN (\
				    SELECT e2.content_id FROM entries e2 \
				    WHERE e2.content_id IS NOT NULL AND e2.volume_id IS NOT NULL \
				    GROUP BY e2.content_id \
				    HAVING COUNT(DISTINCT e2.volume_id) >= {}\
				)",
				min
			)));
		}
		self
	}

	/// Filter by maximum number of volumes content exists on
	pub fn max_volume_count(mut self, max_count: &Option<u32>) -> Self {
		if let Some(max) = max_count {
			self.condition = self.condition.add(Expr::cust(format!(
				"entries.content_id IN (\
				    SELECT e2.content_id FROM entries e2 \
				    WHERE e2.content_id IS NOT NULL AND e2.volume_id IS NOT NULL \
				    GROUP BY e2.content_id \
				    HAVING COUNT(DISTINCT e2.volume_id) <= {}\
				)",
				max
			)));
		}
		self
	}

	/// Apply hidden files filter
	pub fn include_hidden(mut self, include_hidden: &Option<bool>) -> Self {
		if let Some(include) = include_hidden {
			if !include {
				// TODO: Add hidden field to entry table
				// self.condition = self.condition.add(
				//     crate::infra::db::entities::entry::Column::Hidden.eq(false)
				// );
			}
		}
		self
	}
}

// Removed hardcoded extension mapping - now using FileTypeRegistry

/// Format a UUID as a SQLite BLOB literal (`X'...'`).
///
/// `volumes.uuid` is stored as a 16-byte BLOB (SeaORM default for `Uuid`
/// on SQLite), so comparing against a quoted UUID string silently returns
/// zero matches. A blob literal compares byte-for-byte.
fn uuid_to_sqlite_blob_literal(uuid: &Uuid) -> String {
	let mut out = String::with_capacity(36);
	out.push_str("X'");
	for byte in uuid.as_bytes() {
		use std::fmt::Write;
		let _ = write!(out, "{:02X}", byte);
	}
	out.push('\'');
	out
}

impl Default for FilterBuilder {
	fn default() -> Self {
		Self::new()
	}
}
