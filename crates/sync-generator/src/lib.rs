mod attribute;
mod model;
mod sync_data;

use attribute::*;

use prisma_client_rust_sdk::{
	prelude::*,
	prisma::prisma_models::walkers::{
		FieldWalker, ModelWalker, RefinedFieldWalker, RelationFieldWalker,
	},
};

#[derive(Debug, serde::Serialize, thiserror::Error)]
enum Error {}

#[derive(serde::Deserialize)]
struct SDSyncGenerator {}

#[allow(unused)]
#[derive(Clone)]
pub enum ModelSyncType<'a> {
	Local {
		id: FieldWalker<'a>,
	},
	// Owned {
	// 	id: FieldVec<'a>,
	// },
	Shared {
		id: FieldWalker<'a>,
	},
	Relation {
		group: RelationFieldWalker<'a>,
		item: RelationFieldWalker<'a>,
	},
}

impl<'a> ModelSyncType<'a> {
	fn from_attribute(attr: Attribute, model: ModelWalker<'a>) -> Option<Self> {
		Some(match attr.name {
			"local" | "shared" => {
				let id = attr
					.field("id")
					.and_then(|field| match field {
						AttributeFieldValue::Single(s) => Some(s),
						AttributeFieldValue::List(l) => None,
					})
					.and_then(|name| model.fields().find(|f| f.name() == *name))?;

				match attr.name {
					"local" => Self::Local { id },
					"shared" => Self::Shared { id },
					_ => return None,
				}
			}
			"relation" => {
				let get_field = |name| {
					attr.field(name)
						.and_then(|field| match field {
							AttributeFieldValue::Single(s) => Some(*s),
							AttributeFieldValue::List(l) => None,
						})
						.and_then(|name| {
							match model
								.fields()
								.find(|f| f.name() == name)
								.expect(&format!("'{name}' field not found"))
								.refine()
							{
								RefinedFieldWalker::Relation(r) => Some(r),
								_ => None,
							}
						})
						.expect(&format!("'{name}' must be a relation field"))
				};

				Self::Relation {
					item: get_field("item"),
					group: get_field("group"),
				}
			}

			// "owned" => Self::Owned { id },
			_ => return None,
		})
	}

	fn sync_id(&self) -> Vec<FieldWalker> {
		match self {
			// Self::Owned { id } => id.clone(),
			Self::Local { id } => vec![id.clone()],
			Self::Shared { id } => vec![id.clone()],
			Self::Relation { group, item } => vec![(*group).into(), (*item).into()],
			_ => vec![],
		}
	}
}

impl ToTokens for ModelSyncType<'_> {
	fn to_tokens(&self, tokens: &mut TokenStream) {
		let variant = match self {
			Self::Local { .. } => "Local",
			// Self::Owned { .. } => "Owned",
			Self::Shared { .. } => "Shared",
			Self::Relation { .. } => "Relation",
		};

		tokens.append(format_ident!("{variant}SyncType"));
	}
}

pub type ModelWithSyncType<'a> = (ModelWalker<'a>, Option<ModelSyncType<'a>>);

impl PrismaGenerator for SDSyncGenerator {
	const NAME: &'static str = "SD Sync Generator";
	const DEFAULT_OUTPUT: &'static str = "prisma-sync.rs";

	type Error = Error;

	fn generate(self, args: GenerateArgs) -> Result<Module, Self::Error> {
		let db = &args.schema.db;

		let models_with_sync_types = db
			.walk_models()
			.map(|model| (model, model_attributes(model)))
			.map(|(model, attributes)| {
				let sync_type = attributes
					.into_iter()
					.find_map(|a| ModelSyncType::from_attribute(a, model));

				(model, sync_type)
			})
			.collect::<Vec<_>>();

		let model_sync_data = sync_data::r#enum(models_with_sync_types.clone());

		let mut module = Module::new(
			"root",
			quote! {
				use crate::prisma;

				#model_sync_data
			},
		);
		models_with_sync_types
			.into_iter()
			.map(model::module)
			.for_each(|model| module.add_submodule(model));

		Ok(module)
	}
}

pub fn run() {
	SDSyncGenerator::run();
}
