fn main(
    salary: u64,             // private: exact salary amount
    range_min: pub u64,      // public: stated range minimum
    range_max: pub u64,      // public: stated range maximum
) {
    assert(range_min <= range_max);   // sanity: valid range
    assert(salary >= range_min);       // salary >= min
    assert(salary <= range_max);       // salary <= max
}
