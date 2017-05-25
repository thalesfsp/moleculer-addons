/*
 * moleculer-mongoose
 * Copyright (c) 2017 Ice Services (https://github.com/ice-services/moleculer-addons)
 * MIT Licensed
 */

"use strict";

const _ 		= require("lodash");
const mongoose 	= require("mongoose");

module.exports = {

	name: "mongoose",

	/**
	 * Default settings
	 */
	settings: {
		// Connection string
		db: null,

		// Field list for search
		searchFields: null,

		// Property filter
		propertyFilter: null,

		// Auto populates
		populates: null
	},

	/**
	 * Actions
	 */
	actions: {
		/**
		 * 
		 */
		list: {
			cache: {
				keys: [ "limit", "offset", "sort", "search" ]
			},
			handler(ctx) {
				const filter = {};

				const query = this.collection.find(filter);
				return this.applyFilters(query, ctx.params).lean().exec();
			}
		},

		/**
		 * 
		 */
		count: {
			cache: {
				keys: [ "search" ]
			},
			handler(ctx) {
				const filter = {};
				// TODO: search
				return this.collection.where(filter).count();
			}
		},		

		/**
		 * 
		 */
		create: {
			handler(ctx) {
				return this.Promise.resolve(ctx)
					.then(ctx => {
						const item = new this.collection(ctx.params.entity);
						return item.save();
					})
					.then(doc => this.toJSON(doc))
					.then(json => this.popuplateModels(ctx, json))
					.then(json => this.clearCache().then(() => json));
			}
		},

		/**
		 * 
		 */
		get: {
			cache: {
				keys: [ "id" ]
			},
			handler(ctx) {
				return this.Promise.resolve(ctx)
					.then(ctx => {
						return this.collection.findById(ctx.params.id).lean().exec();
					})
					.then(doc => this.toJSON(doc))
					.then(json => this.popuplateModels(ctx, json));
			}
		},

		/**
		 * 
		 */
		update: {
			handler(ctx) {
				return this.Promise.resolve(ctx)
					.then(ctx => {
						return this.collection.findByIdAndUpdate(ctx.params.id, ctx.params.update, { "new": true });
					})
					.then(doc => this.toJSON(doc))
					.then(json => this.popuplateModels(ctx, json))
					.then(json => this.clearCache().then(() => json));
			}
		},

		/**
		 * 
		 */
		remove: {
			handler(ctx) {
				return this.collection.findByIdAndRemove(ctx.params.id)
					.then(() => this.clearCache());
			}
		},

		/**
		 * 
		 */
		drop: {
			handler() {
				return this.collection.remove({})
					.then(() => this.clearCache());
			}
		}
	},

	/**
	 * Methods
	 */
	methods: {
		/**
		 * 
		 * 
		 * @returns 
		 */
		connect() {
			let uri, opts;
			if (_.isObject(this.settings.db) && this.settings.db.uri != null) {
				uri = this.settings.db.uri;
				opts = this.settings.db.opts;
			} else {
				uri = this.settings.db;			
			}

			this.logger.debug(`Connecting to MongoDB (${uri})...`);
			this.db = mongoose.connect(uri, opts).connection;

			return this.db;
		},

		/**
		 * 
		 * 
		 * @param {any} q 
		 * @param {any} params 
		 * @returns 
		 */
		applyFilters(q, params) {
			if (params) {
				if (_.isNumber(params.limit))
					q.limit(params.limit);

				if (_.isNumber(params.offset))
					q.skip(params.offset);

				if (_.isString(params.sort))
					q.sort(params.sort.replace(/,/, " "));

				// TODO `search` with `searchField`
			}
			return q;
		},

		/**
		 * Clear cache entities
		 * 
		 */
		clearCache() {
			this.broker.emit("cache.clean", this.name + ".*");
			return Promise.resolve();
		},

		/**
		 * Convert the `docs` MongoDB model to JSON object.
		 * With `propFilter` can be filter the properties
		 * 
		 * @param {MongoDocument} 	docs		MongoDB document(s)
		 * @param {String|Array} 			propFilter	Filter properties of model. It is a space-separated `String` or an `Array`
		 * @returns								Object|Array
		 * 
		 * @memberOf Service
		 */
		toJSON(docs, propFilter) {
			let func = function (doc) {
				let json = (doc.constructor && doc.constructor.name === "model") ? doc.toJSON() : doc;

				if (propFilter != null)
					return _.pick(json, propFilter);

				return json;
			};

			if (propFilter == null) {
				propFilter = this.settings.modelPropFilter;
			}

			if (_.isString(propFilter))
				propFilter = propFilter.split(" ");

			if (_.isArray(docs)) {
				return docs.map(doc => func(doc, propFilter));
			} else if (_.isObject(docs)) {
				return func(docs);
			}
		},

		popuplateModels(ctx, docs) {
			return docs;
		}
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {
		if (!this.schema.collection)
			throw new Error("Missing `collection` definition!");

		mongoose.Promise = this.Promise;
		this.collection = this.schema.collection;

		this.db = null;
	},

	/**
	 * Service started lifecycle event handler
	 */
	started() {
		this.connect();

		if (this.db) {
			this.db.on("error", function mongoConnectionError(err) {
				if (err.message.code === "ETIMEDOUT") {
					this.logger.warn("Mongo connection timeout!", err);
					setTimeout(() => {
						this.connect();
					}, 1000);
					return;
				}

				this.logger.error("Could not connect to MongoDB!", this.settings.db);
				this.logger.error(err);

			}.bind(this));

			this.db.once("open", function mongoAfterOpen() {
				this.logger.info("Connected to MongoDB.");

				// Call an 'afterConnected' handler in schema
				if (_.isFunction(this.schema.afterConnected)) 
					this.schema.afterConnected.call(this);
			}.bind(this));	

			this.db.on("disconnected", function mongoDisconnected() {
				this.logger.warn("Disconnected from MongoDB.");
			}.bind(this));	
		}	
	},

	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() {
		if (this.db) {
			this.db.close();
		}
	}
};