import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ordersService } from "../services/ordersService";
import { userService } from "../services/userService";
import "../styles/Add_Scheme.css";

type StateOption = {
  id: number;
  name: string;
  code: string;
};

export default function Add_Scheme() {
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    scheme_name: "",
    item_code: "",
    state_code: "",
  });

  const payload = {
    scheme_name: formData.scheme_name,
    item_code: formData.item_code,
    state_code: formData.state_code,
  };

  useEffect(() => {
    const fetchStates = async () => {
      setIsLoadingStates(true);
      try {
        const data = await userService.getState();
        setStates(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching states:", error);
        setStates([]);
      } finally {
        setIsLoadingStates(false);
      }
    };

    void fetchStates();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stateDropdownRef.current &&
        !stateDropdownRef.current.contains(event.target as Node)
      ) {
        setStateDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await ordersService.createScheme(payload);

      console.log("Success:", response);

      alert("Scheme created successfully");

      setFormData({
        scheme_name: "",
        item_code: "",
        state_code: "",
      });
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create scheme");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const selectedStateName =
    states.find((state) => state.code === formData.state_code)?.name ||
    (isLoadingStates ? "Loading states..." : "Select state");

  return (
    <div className="asg-page app-page">
      {/* <div className="asg-header app-page-head">
        <div>
          <span className="app-chip asg-chip">Scheme Setup</span>
          <h1 className="asg-title app-page-title">Add Scheme</h1>
          <p className="asg-subtitle app-page-subtitle">
            Create product schemes.
          </p>
        </div>
      </div> */}

      <div className="asg-form-card app-card">
        <div className="asg-form-head">
          <h1 className="asg-form-title">Add Scheme</h1>
          {/* <p className="asg-form-subtitle">
            Fill in the scheme name, product item code and state.
          </p> */}
        </div>

        <form className="asg-form" onSubmit={handleSubmit}>
          <div className="asg-form-grid">
            <div className="asg-field">
              <label className="asg-label" htmlFor="scheme_name">
                Scheme Name
              </label>
              <div className="asg-input-wrap">
                <input
                  id="scheme_name"
                  name="scheme_name"
                  type="text"
                  placeholder="Enter scheme name"
                  value={formData.scheme_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="asg-field">
              <label className="asg-label">
                State
              </label>
              <div className="asg-dropdown" ref={stateDropdownRef}>
                <button
                  type="button"
                  className="asg-dropdown-trigger"
                  onClick={() => !isLoadingStates && setStateDropdownOpen((value) => !value)}
                  disabled={isLoadingStates}
                  aria-expanded={stateDropdownOpen}
                >
                  <span>{selectedStateName}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="#64748b"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {stateDropdownOpen && (
                  <div className="asg-dropdown-menu">
                    {states.map((state) => (
                      <button
                        key={state.id}
                        type="button"
                        className={`asg-dropdown-option${formData.state_code === state.code ? " is-selected" : ""}`}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, state_code: state.code }));
                          setStateDropdownOpen(false);
                        }}
                      >
                        {state.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="asg-field">
              <label className="asg-label" htmlFor="item_code">
                Item Code
              </label>
              <div className="asg-input-wrap">
                <input
                  id="item_code"
                  name="item_code"
                  type="text"
                  placeholder="Eg: FG0000005"
                  value={formData.item_code}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

          </div>

          <div className="asg-actions">
            <button
              className="asg-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
