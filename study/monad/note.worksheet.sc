def adder(n: Int): Int => Int =
    x => x + n

adder(3)(4)