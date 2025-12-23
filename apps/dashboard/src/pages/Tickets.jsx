import React, { useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';

const Tickets = () => {
  const [tickets] = useState([
    { id: 1, title: 'Fix login bug', state: 'open', project: 'web-app', priority: 'high', assignee: 'John Doe' },
    { id: 2, title: 'Add new feature', state: 'closed', project: 'mobile-app', priority: 'medium', assignee: 'Jane Smith' },
    { id: 3, title: 'Update documentation', state: 'open', project: 'web-app', priority: 'low', assignee: 'Bob Johnson' },
    { id: 4, title: 'Performance optimization', state: 'in-progress', project: 'api', priority: 'high', assignee: 'Alice Brown' },
    { id: 5, title: 'Security audit', state: 'open', project: 'api', priority: 'critical', assignee: 'Charlie Wilson' }
  ]);

  const [filterState, setFilterState] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  const states = ['all', 'open', 'closed', 'in-progress'];
  const projects = ['all', 'web-app', 'mobile-app', 'api'];
  const priorities = ['all', 'critical', 'high', 'medium', 'low'];

  const filteredAndSortedTickets = useMemo(() => {
    let filtered = tickets.filter(ticket => {
      const stateMatch = filterState === 'all' || ticket.state === filterState;
      const projectMatch = filterProject === 'all' || ticket.project === filterProject;
      const priorityMatch = filterPriority === 'all' || ticket.priority === filterPriority;
      return stateMatch && projectMatch && priorityMatch;
    });

    return filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  }, [tickets, filterState, filterProject, filterPriority, sortBy, sortOrder]);

  const clearAllFilters = () => {
    setFilterState('all');
    setFilterProject('all');
    setFilterPriority('all');
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-700 bg-red-50';
      case 'high': return 'text-orange-700 bg-orange-50';
      case 'medium': return 'text-yellow-700 bg-yellow-50';
      case 'low': return 'text-blue-700 bg-blue-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  };

  const getStateColor = (state) => {
    switch (state) {
      case 'open': return 'text-green-700 bg-green-50';
      case 'closed': return 'text-gray-700 bg-gray-50';
      case 'in-progress': return 'text-blue-700 bg-blue-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  };

  const FilterDropdown = ({ label, value, onChange, options }) => (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
        {label}: {value}
        <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" aria-hidden="true" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {options.map((option) => (
              <Menu.Item key={option}>
                {({ active }) => (
                  <button
                    onClick={() => onChange(option)}
                    className={`${
                      active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                    } block px-4 py-2 text-sm w-full text-left capitalize`}
                  >
                    {option}
                  </button>
                )}
              </Menu.Item>
            ))}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">Tickets</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all tickets including their title, state, project, priority, and assignee.
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="filters-toolbar mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-gray-50 p-4">
        <div className="filter-group flex flex-wrap items-center gap-3">
          <FilterDropdown
            label="State"
            value={filterState}
            onChange={setFilterState}
            options={states}
          />
          <FilterDropdown
            label="Project"
            value={filterProject}
            onChange={setFilterProject}
            options={projects}
          />
          <FilterDropdown
            label="Priority"
            value={filterPriority}
            onChange={setFilterPriority}
            options={priorities}
          />
        </div>
        
        <button
          onClick={clearAllFilters}
          className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Clear All Filters
        </button>
        
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-600">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="title">Title</option>
            <option value="state">State</option>
            <option value="project">Project</option>
            <option value="priority">Priority</option>
            <option value="assignee">Assignee</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="rounded-md bg-white px-2 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Title
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      State
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Project
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Priority
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Assignee
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredAndSortedTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {ticket.title}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium capitalize ${getStateColor(ticket.state)}`}>
                          {ticket.state}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {ticket.project}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium capitalize ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {ticket.assignee}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {filteredAndSortedTickets.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">No tickets match the current filters.</p>
        </div>
      )}
    </div>
  );
};

export default Tickets;